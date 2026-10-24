'use client';

import { BookOpenTextIcon, CheckIcon, ChevronDownIcon, LibraryBigIcon, NotebookPenIcon, XIcon } from 'lucide-react';
import { lazy, type ReactNode, type RefObject, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  StudyCard,
  StudyCardAside,
  StudyCardHeader,
  StudyCardMain,
  StudyCardSection,
  StudyCardStage,
  studyCardReveal,
} from '@/components/ui/study-card';
import { cn } from '@/lib/utils';
import { blankBadge } from './blank-field';
import { formatKey, formatResponse, type GradingSpec, type QuestionType } from './grading';
import { QuestionMarkActions, QuestionMarksScope, QuestionUserTags, useMarks } from './marks/question-marks';
import { NoteEditor } from './marks/note-editor';
import { MathPreview } from './math-preview';
import { BuiltinTags } from './question-tags';
import type { QuestionTag } from './model';
import { mirrorQuestion } from './question-mirror';
import { QuestionStateScope, useQuestionState, type QuestionState } from './question-state';
import { removeSolutionEntry, setSolutionEntry, useSolutionDeck, type SolutionEntry } from './solution-deck';

// Opened from the toolbar as a page of the card; loaded on first use.
const QuestionLibraryDialog = lazy(() => import('./marks/library-dialog').then((module) => ({ default: module.QuestionLibraryDialog })));

/*
 * "题目与解析": a study card (components/ui/study-card.tsx) for each question
 * of the page that has a solution, opened on the question asked and stepped
 * through the others with the pager, ←/→ or a swipe.
 *
 *   header   number, type and tags; the reader's marks, the library and
 *            the pager in the toolbar (top right)
 *   aside    the question (a read-only copy of the page's own rendering,
 *            the key revealed), on a wash of the question type's colour;
 *            on desktop also the reader's note
 *   main     the reader's answer next to the correct one, the solution,
 *            and on phones the note
 *
 * Desktop shows the two side by side, each scrolling on its own; phones
 * stack them in one scroll, the question folded to a few lines first so the
 * answer is in view. The library opens as a page of the same card, pushed in
 * from the right. Focus starts on the title and returns, on close, to the
 * 查看解答 button of the question last shown, which scrolls it into view.
 *
 * Every sheet registers its question in the page's deck (solution-deck.ts);
 * a card shows another question with that question's own state and marks.
 */

// Portaled out of #docs-body: `docs-prose` gives it the page typography.
const prose = 'prose docs-prose max-w-none min-w-0';
const proseReset = '[&>:first-child]:mt-0 [&>:last-child]:mb-0';

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
        <span className="min-w-0 text-lg font-semibold" data-choice-letters={spec.kind === 'choice' ? '' : undefined}>{formatKey(spec)}</span>
      </div>
      {submitted ? (
        <div className={cn(tile, submitted.evaluation!.result === 'correct' ? 'bg-(--ui-fill)' : submitted.evaluation!.result === 'partial' ? 'bg-warning/15' : 'bg-destructive/8')}>
          <span className="shrink-0 text-sm text-muted-foreground">你的答案</span>
          <span className="min-w-0 text-lg font-semibold break-words" data-choice-letters={spec.kind === 'choice' && submitted.selected.length ? '' : undefined}>{formatResponse(spec, submitted.selected, submitted.values)}</span>
          <span className="ml-auto self-center"><Verdict correct={submitted.evaluation!.result === 'correct'} /></span>
        </div>
      ) : null}
    </div>
  );
}

/** The reader's note, editable in place inside the sheet. */
function SheetNote({ editing, setEditing, order }: { editing: boolean; setEditing: (editing: boolean) => void; order: number }) {
  const marks = useMarks();
  if (!marks) return null;
  const note = marks.mark?.note ?? '';
  return (
    <StudyCardSection
      label="我的注释"
      meta={!editing ? (
        <Button variant="ghost" size="xs" className="-my-1 text-muted-foreground" onClick={() => setEditing(true)} disabled={!marks.ready}>
          <NotebookPenIcon data-icon="inline-start" />{note ? '编辑' : '添加'}
        </Button>
      ) : null}
      {...studyCardReveal(order)}
    >
      {editing ? (
        <NoteEditor initial={note} onCancel={() => setEditing(false)} onSave={async (next) => { if (await marks.update({ note: next })) setEditing(false); }} />
      ) : note ? (
        <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">{note}</p>
      ) : (
        <p className="text-sm text-muted-foreground">还没有注释。记下思路或易错点，下次复习一眼可见。</p>
      )}
    </StudyCardSection>
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

/** The colour each question type washes its card's question pane with. */
const TYPE_TINTS: Record<QuestionType, string> = {
  single: 'oklch(0.62 0.13 250)',
  multiple: 'oklch(0.6 0.13 292)',
  boolean: 'oklch(0.64 0.1 182)',
  blank: 'oklch(0.7 0.12 74)',
  essay: 'oklch(0.64 0.12 28)',
};

export type QuestionSolutionSheetProps = {
  questionId: string;
  questionType: QuestionType;
  solution: ReactNode;
  buttonLabel: string;
  dialogTitle: string;
  numberLabel: string | null;
  typeLabel: string;
  tags: QuestionTag[];
};

/*
 * The trigger is a plain button; the card mounts on first open and then
 * stays so later opens and the close animation are instant. A long page has
 * a hundred of these, most never opened: until then each one only keeps its
 * entry in the page's deck current.
 */
export function QuestionSolutionSheet({ buttonLabel, questionId, questionType, solution, dialogTitle, numberLabel, typeLabel, tags }: QuestionSolutionSheetProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const key = useId();
  const state = useQuestionState();
  const marks = useMarks();

  const entry = useMemo<SolutionEntry>(() => ({
    key, questionId, questionType, trigger: triggerRef, solution, dialogTitle, numberLabel, typeLabel, tags, state, marks,
  }), [key, questionId, questionType, solution, dialogTitle, numberLabel, typeLabel, tags, state, marks]);

  useEffect(() => setSolutionEntry(entry), [entry]);
  useEffect(() => () => removeSolutionEntry(key), [key]);

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
      {mounted ? <SolutionCard self={entry} open={open} setOpen={setOpen} triggerRef={triggerRef} /> : null}
    </>
  );
}

const toolbarButton = buttonVariants({ variant: 'ghost', size: 'icon' }) + ' size-8 rounded-full text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active) aria-expanded:text-foreground';

/** Gives a card the live state and marks of the question it shows. */
function EntryScope({ entry, children }: { entry: SolutionEntry; children: ReactNode }) {
  return (
    <QuestionStateScope value={entry.state}>
      <QuestionMarksScope value={entry.marks}>{children}</QuestionMarksScope>
    </QuestionStateScope>
  );
}

function SolutionCard({ self, open, setOpen, triggerRef }: {
  self: SolutionEntry;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const deck = useSolutionDeck(open);
  const [currentKey, setCurrentKey] = useState(self.key);
  const [editingNote, setEditingNote] = useState(false);
  const [library, setLibrary] = useState<'closed' | 'open' | 'mounted'>('closed');
  const desktop = useDesktop();

  // Every open starts on the question it was opened from.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setCurrentKey(self.key);
  }

  const found = deck.findIndex((entry) => entry.key === currentKey);
  const cards = found >= 0 ? deck : [self];
  const index = Math.max(0, found);
  const entry = cards[index] ?? self;

  return (
    <StudyCard
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) setEditingNote(false); }}
      count={cards.length}
      index={index}
      onIndexChange={(next) => {
        const target = cards[next];
        if (!target) return;
        setCurrentKey(target.key);
        setEditingNote(false);
      }}
      itemKey={entry.key}
      labels={{ group: '切换题目', prev: '上一题', next: '下一题' }}
      tint={TYPE_TINTS[entry.questionType]}
      size="xl"
      height="46rem"
      className="text-base"
      finalFocus={() => entry.trigger.current ?? triggerRef.current ?? true}
    >
      <EntryScope entry={entry}>
        <StudyCardHeader
          title={entry.numberLabel ? `第 ${entry.numberLabel} 题` : entry.dialogTitle}
          tags={(
            <>
              <Chip>{entry.typeLabel}</Chip>
              <BuiltinTags tags={entry.tags} />
              <QuestionUserTags />
            </>
          )}
          tagsProps={{ 'aria-label': '标签' }}
          actionsLabel="题目操作"
          actions={(
            <>
              <QuestionMarkActions editingNote={editingNote} onEditNote={() => setEditingNote(!editingNote)} />
              <button
                type="button"
                className={toolbarButton}
                aria-expanded={library === 'open'}
                aria-label="收藏与标签"
                title="收藏与标签"
                onClick={() => setLibrary('open')}
              >
                <LibraryBigIcon />
              </button>
            </>
          )}
        />
      </EntryScope>

      <StudyCardStage ratio={0.46}>
        <EntryScope entry={entry}>
          <SolutionCardBody entry={entry} desktop={desktop} editingNote={editingNote} setEditingNote={setEditingNote} />
        </EntryScope>
      </StudyCardStage>

      {/* A page of this card: pushed in from the right, back returns here. */}
      {library !== 'closed' ? (
        <Suspense fallback={null}>
          <QuestionLibraryDialog open={library === 'open'} onOpenChange={(next) => setLibrary(next ? 'open' : 'mounted')} />
        </Suspense>
      ) : null}
    </StudyCard>
  );
}

/** One card's panes. Kept as rendered while the card leaves, with the scope it was given. */
function SolutionCardBody({ entry, desktop, editingNote, setEditingNote }: {
  entry: SolutionEntry;
  desktop: boolean;
  editingNote: boolean;
  setEditingNote: (editing: boolean) => void;
}) {
  const { questionId, state, solution } = entry;
  const spec = state?.spec ?? null;
  return (
    <>
      <StudyCardAside className="@container">
        <StudyCardSection label="题目" {...studyCardReveal(0)}>
          <QuestionMirror questionId={questionId} state={state} />
        </StudyCardSection>
        {desktop ? <SheetNote editing={editingNote} setEditing={setEditingNote} order={1} /> : null}
      </StudyCardAside>

      <StudyCardMain>
        {spec ? (
          <StudyCardSection label="答案" {...studyCardReveal(0)}>
            <AnswerSummary spec={spec} state={state} />
          </StudyCardSection>
        ) : null}
        <StudyCardSection label={spec ? '解析' : '参考解答'} {...studyCardReveal(1)}>
          <div className={cn(prose, proseReset, '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden')}>
            {solution}
          </div>
        </StudyCardSection>
        {!desktop ? <SheetNote editing={editingNote} setEditing={setEditingNote} order={2} /> : null}
      </StudyCardMain>
    </>
  );
}
