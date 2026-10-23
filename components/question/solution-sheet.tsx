'use client';

import { BookOpenTextIcon, CheckIcon, ChevronDownIcon, LibraryBigIcon, NotebookPenIcon, XIcon } from 'lucide-react';
import { lazy, type ReactNode, type RefObject, Suspense, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalPane, ModalSplit, ModalTags, ModalTitle, ModalToolbar } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { blankBadge } from './blank-field';
import { formatKey, formatResponse, type GradingSpec } from './grading';
import { QuestionMarkActions, QuestionUserTags, useMarks } from './marks/question-marks';
import { NoteEditor } from './marks/note-editor';
import { MathPreview } from './math-preview';
import { BuiltinTags } from './question-tags';
import type { QuestionTag } from './model';
import { mirrorQuestion } from './question-mirror';
import { useQuestionState, type QuestionState } from './question-state';

// Opened from the toolbar on top of the sheet; loaded on first use.
const QuestionLibraryDialog = lazy(() => import('./marks/library-dialog').then((module) => ({ default: module.QuestionLibraryDialog })));

/*
 * "题目与解析": a modal (components/ui/modal.tsx) with the question (a
 * read-only copy of the page's own rendering, the key revealed), the
 * reader's answer next to the correct one, the solution and the reader's note.
 *
 * Header: number, type and tags; the reader's marks and the library in the
 * toolbar. The library opens as a second level on top of this one.
 * Content: two panes that scroll on their own on desktop; one scroll on
 * phones, the question folded to a few lines first so the answer is in view.
 * Focus starts on the title and returns to the trigger.
 */

// Portaled out of #docs-body: `docs-prose` gives it the page typography.
const prose = 'prose docs-prose max-w-none min-w-0';
const proseReset = '[&>:first-child]:mt-0 [&>:last-child]:mb-0';

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-7 items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground">
      <span>{children}</span>
      {action ? <span className="ml-auto">{action}</span> : null}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-(--ui-fill) px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

/** Read-only copy of the question as rendered on the page. */
function QuestionMirror({ questionId, state }: { questionId: string; state: QuestionState | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const copy = mirrorQuestion(questionId, {
      spec: state?.spec ?? null,
      submitted: state?.submitted ?? false,
      values: state?.values ?? [],
      verdicts: state?.evaluation?.blanks ?? [],
    });
    element.replaceChildren(...(copy ? [copy] : []));
    // Fold long questions on phones only; desktop has its own pane for them.
    const narrow = window.matchMedia('(max-width: 767px)').matches;
    setFolded(narrow && element.scrollHeight > 200 ? true : null);
  }, [questionId, state?.spec, state?.submitted, state?.values, state?.evaluation]);

  return (
    <div className="relative">
      <div
        ref={host}
        className={cn(prose, proseReset, 'overflow-hidden', folded && 'max-h-44 [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]')}
      />
      {folded !== null ? (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-(--ui-fill) px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={!folded}
          onClick={() => setFolded(!folded)}
        >
          <ChevronDownIcon className={cn('size-3.5 transition-transform', !folded && 'rotate-180')} />
          {folded ? '展开题目' : '收起题目'}
        </button>
      ) : null}
    </div>
  );
}

function Verdict({ correct }: { correct: boolean }) {
  return (
    <span
      className={cn('grid size-5 shrink-0 place-items-center rounded-full [&_svg]:size-3', correct ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground')}
      aria-label={correct ? '正确' : '错误'}
      role="img"
    >
      {correct ? <CheckIcon strokeWidth={3} /> : <XIcon strokeWidth={3} />}
    </span>
  );
}

const tile = 'flex min-w-0 items-baseline gap-3 rounded-(--ui-radius-control) px-4 py-2.5 leading-relaxed';

/** Correct answer beside the reader's submitted one. */
function AnswerSummary({ spec, state }: { spec: GradingSpec; state: QuestionState | null }) {
  const submitted = state?.submitted && state.evaluation ? state : null;

  if (spec.kind === 'blank') {
    return (
      <ol className="grid gap-2">
        {spec.blanks.map((blank, index) => {
          const verdict = submitted?.evaluation?.blanks[index];
          const yours = submitted?.values[index]?.trim();
          return (
            <li key={index} className={cn(tile, 'flex-wrap bg-(--ui-fill)', verdict && verdict !== 'correct' && 'bg-destructive/8')}>
              {spec.blanks.length > 1 ? <span className="text-muted-foreground">{blankBadge(index)}</span> : null}
              <span className="text-sm text-success">答案</span>
              <span className="text-lg font-semibold">
                {blank.kind === 'math' ? <MathPreview text={blank.answer} /> : blank.answer}
              </span>
              {submitted ? (
                <span className="ml-auto inline-flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">你填</span>
                  <span className="font-medium break-all">{yours ? (blank.kind === 'math' ? <MathPreview text={yours} /> : yours) : '—'}</span>
                  <Verdict correct={verdict === 'correct'} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
      <div className={cn(tile, 'bg-success/10')}>
        <span className="shrink-0 text-sm text-success">正确答案</span>
        <span className="min-w-0 text-lg font-semibold">{formatKey(spec)}</span>
      </div>
      {submitted ? (
        <div className={cn(tile, submitted.evaluation!.result === 'correct' ? 'bg-(--ui-fill)' : submitted.evaluation!.result === 'partial' ? 'bg-warning/15' : 'bg-destructive/8')}>
          <span className="shrink-0 text-sm text-muted-foreground">你的答案</span>
          <span className="min-w-0 text-lg font-semibold break-words">{formatResponse(spec, submitted.selected, submitted.values)}</span>
          <span className="ml-auto self-center"><Verdict correct={submitted.evaluation!.result === 'correct'} /></span>
        </div>
      ) : null}
    </div>
  );
}

/** The reader's note, editable in place inside the sheet. */
function SheetNote({ editing, setEditing }: { editing: boolean; setEditing: (editing: boolean) => void }) {
  const marks = useMarks();
  if (!marks) return null;
  const note = marks.mark?.note ?? '';
  return (
    <section aria-label="我的注释">
      <SectionLabel
        action={!editing ? (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setEditing(true)} disabled={!marks.ready}>
            <NotebookPenIcon data-icon="inline-start" />{note ? '编辑' : '添加'}
          </Button>
        ) : null}
      >
        我的注释
      </SectionLabel>
      {editing ? (
        <NoteEditor initial={note} onCancel={() => setEditing(false)} onSave={async (next) => { if (await marks.update({ note: next })) setEditing(false); }} />
      ) : note ? (
        <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">{note}</p>
      ) : (
        <p className="text-sm text-muted-foreground">还没有注释。记下思路或易错点，下次复习一眼可见。</p>
      )}
    </section>
  );
}

const DESKTOP = '(min-width: 768px)';
const subscribeDesktop = (listener: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

/** Desktop puts the note under the question, phones after the solution. */
function useDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => true);
}

export type QuestionSolutionSheetProps = {
  questionId: string;
  solution: ReactNode;
  buttonLabel: string;
  dialogTitle: string;
  numberLabel: string | null;
  typeLabel: string;
  tags: QuestionTag[];
};

/*
 * The trigger is a plain button; the dialog tree mounts on first open and
 * then stays so later opens and the close animation are instant. A long page
 * has a hundred of these, most never opened.
 */
export function QuestionSolutionSheet({ buttonLabel, ...props }: QuestionSolutionSheetProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-solution-trigger=""
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'h-8 rounded-full bg-(--ui-fill) px-3.5 text-foreground/80 hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active)',
        )}
        onClick={() => { setMounted(true); setOpen(true); }}
      >
        <BookOpenTextIcon data-icon="inline-start" />
        {buttonLabel}
      </button>
      {mounted ? <SheetDialog {...props} open={open} setOpen={setOpen} triggerRef={triggerRef} /> : null}
    </>
  );
}

type SheetDialogProps = Omit<QuestionSolutionSheetProps, 'buttonLabel'> & {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const toolbarButton = buttonVariants({ variant: 'ghost', size: 'icon' }) + ' size-8 rounded-full text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active) aria-expanded:text-foreground';

function SheetDialog({ questionId, solution, dialogTitle, numberLabel, typeLabel, tags, open, setOpen, triggerRef }: SheetDialogProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [library, setLibrary] = useState<'closed' | 'open' | 'mounted'>('closed');
  const desktop = useDesktop();
  const state = useQuestionState();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const spec = state?.spec ?? null;

  return (
    <Modal open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditingNote(false); }}>
      <ModalContent
        size="xl"
        initialFocus={titleRef}
        finalFocus={triggerRef}
        className="text-base md:min-h-[min(30rem,calc(100dvh-4rem))]"
      >
        <ModalHeader>
          <ModalTitle ref={titleRef}>{numberLabel ? `第 ${numberLabel} 题` : dialogTitle}</ModalTitle>
          <ModalTags aria-label="标签">
            <Chip>{typeLabel}</Chip>
            <BuiltinTags tags={tags} />
            <QuestionUserTags />
          </ModalTags>
          <ModalToolbar aria-label="题目操作">
            <QuestionMarkActions editingNote={editingNote} onEditNote={() => setEditingNote(!editingNote)} />
            <button
              type="button"
              className={toolbarButton}
              aria-haspopup="dialog"
              aria-expanded={library === 'open'}
              aria-label="收藏与标签"
              title="收藏与标签"
              onClick={() => setLibrary('open')}
            >
              <LibraryBigIcon />
            </button>
          </ModalToolbar>
        </ModalHeader>

        <ModalSplit columns="minmax(0,0.9fr) minmax(0,1.1fr)">
          <ModalPane tone="muted" className="@container flex flex-col gap-7">
            <section aria-label="题目">
              <SectionLabel>题目</SectionLabel>
              <QuestionMirror questionId={questionId} state={state} />
            </section>
            {desktop ? <SheetNote editing={editingNote} setEditing={setEditingNote} /> : null}
          </ModalPane>

          <ModalPane className="flex flex-col gap-7">
            {spec ? (
              <section aria-label="答案" className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 delay-100">
                <SectionLabel>答案</SectionLabel>
                <AnswerSummary spec={spec} state={state} />
              </section>
            ) : null}
            <section aria-label={spec ? '解析' : '参考解答'} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 delay-200">
              <SectionLabel>{spec ? '解析' : '参考解答'}</SectionLabel>
              <div className={cn(prose, proseReset, '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden')}>
                {solution}
              </div>
            </section>
            {!desktop ? <SheetNote editing={editingNote} setEditing={setEditingNote} /> : null}
          </ModalPane>
        </ModalSplit>

        {/* Second level: rendered inside this modal so it stacks on top of it. */}
        {library !== 'closed' ? (
          <Suspense fallback={null}>
            <QuestionLibraryDialog open={library === 'open'} onOpenChange={(next) => setLibrary(next ? 'open' : 'mounted')} />
          </Suspense>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
