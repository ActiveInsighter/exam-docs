'use client';

import { BookOpenIcon, LibraryBigIcon, NotebookPenIcon } from 'lucide-react';

import { BookOpenIcon as AnimatedBookOpenIcon } from '@/components/animate-ui/icons/book-open';
import { LibraryBigIcon as AnimatedLibraryBigIcon } from '@/components/animate-ui/icons/library-big';
import { NotebookPenIcon as AnimatedNotebookPenIcon } from '@/components/animate-ui/icons/notebook-pen';
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { IconButton } from '@/components/ui/icon-button';
import { RippleButton } from '@/components/ui/ripple-button';
import {
  StudyCard,
  StudyCardAside,
  StudyCardHeader,
  StudyCardMain,
  StudyCardSection,
  StudyCardStage,
} from '@/components/ui/study-card';
import { ActionIcon } from '@/components/ui/action-icon';
import { cn } from '@/lib/utils';
import { AnswerSummary } from './answer-summary';
import { NoteEditor } from './marks/note-editor';
import {
  QuestionMarkActions,
  QuestionMarksScope,
  QuestionUserTags,
  iconAction,
  useMarks,
} from './marks/question-marks';
import type { QuestionMeta } from './model';
import { revealQuestion } from './page-questions';
import { QuestionMirror } from './question-mirror';
import { QuestionStateScope, useQuestionState } from './question-state';
import { QuestionPointTags, QuestionSourceTrail, QuestionTypeTag } from './question-tags';
import { SelfGrade } from './self-grade';
import { removeSolutionEntry, setSolutionEntry, useSolutionDeck, type SolutionEntry } from './solution-deck';

// The library is a nested Modal, loaded on first use.
const QuestionLibraryDialog = lazy(() =>
  import('./marks/library-dialog').then((module) => ({ default: module.QuestionLibraryDialog })),
);

/*
 * "题目与解析": a study card (components/ui/study-card.tsx) for each question
 * of the page that has a solution, opened on the question asked and stepped
 * through the others with the pager, ←/→ or a swipe.
 *
 *   header   number; type and source on one capsule beside it (the
 *            reader's tags with them); the reader's marks, the library
 *            and the pager in the toolbar (top right)
 *   aside    the question (question-mirror.tsx: a read-only copy of the
 *            page's own rendering, the key revealed), its knowledge points
 *            and, on desktop, the reader's note
 *   main     the reader's answer next to the correct one
 *            (answer-summary.tsx), the solution, and on phones the note
 *
 * Desktop shows the two side by side, each scrolling on its own; phones
 * stack them in one scroll. The library opens as a nested sheet above the card.
 * Focus starts on the title and returns, on close,
 * to the 查看解答 button of the question last shown, which scrolls it into
 * view.
 *
 * Every sheet registers its question in the page's deck (solution-deck.ts);
 * a card shows another question with that question's own state and marks.
 */

// Portaled out of #docs-body: `docs-prose` gives it the page typography.
const prose = 'prose docs-prose max-w-none min-w-0 [&>:first-child]:mt-0 [&>:last-child]:mb-0';

/*
 * The trigger is a shared RippleButton; the card mounts on first open and then
 * stays so later opens and the close animation are instant. A long page has
 * a hundred of these, most never opened: until then each one only keeps its
 * entry in the page's deck current.
 */
export function QuestionSolutionSheet({ meta, solution }: { meta: QuestionMeta; solution: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const key = useId();
  const state = useQuestionState();
  const marks = useMarks();

  const entry = useMemo<SolutionEntry>(
    () => ({ key, meta, solution, trigger, state, marks }),
    [key, meta, solution, state, marks],
  );
  useEffect(() => setSolutionEntry(entry), [entry]);
  useEffect(() => () => removeSolutionEntry(key), [key]);

  return (
    <>
      <RippleButton
        ref={trigger}
        variant="ghost"
        size="sm"
        data-solution-trigger=""
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'h-8 gap-1.5 rounded-full bg-(--ui-fill) px-3.5 text-[0.8125rem] text-foreground/80 hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active) has-data-[icon=inline-start]:pl-3',
        )}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <ActionIcon icon={BookOpenIcon} animatedIcon={AnimatedBookOpenIcon} data-icon="inline-start" />
        查看解答
      </RippleButton>

      {mounted ? <SolutionCard self={entry} open={open} setOpen={setOpen} /> : null}
    </>
  );
}

/** Gives a card the live state and marks of the question it shows. */
function EntryScope({ entry, children }: { entry: SolutionEntry; children: ReactNode }) {
  return (
    <QuestionStateScope value={entry.state}>
      <QuestionMarksScope value={entry.marks}>{children}</QuestionMarksScope>
    </QuestionStateScope>
  );
}

const DESKTOP = '(min-width: 768px)';
const subscribeDesktop = (listener: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

function SolutionCard({
  self,
  open,
  setOpen,
}: {
  self: SolutionEntry;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const deck = useSolutionDeck(open);
  const [currentKey, setCurrentKey] = useState(self.key);
  const [editingNote, setEditingNote] = useState(false);
  const [library, setLibrary] = useState<'closed' | 'open' | 'mounted'>('closed');
  // Desktop puts the note under the question, phones after the solution.
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );

  // Every open starts on the question it was opened from.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setCurrentKey(self.key);
  }

  const found = deck.findIndex((entry) => entry.key === currentKey);
  const cards = found >= 0 ? deck : [self];
  const entry = cards[Math.max(0, found)] ?? self;
  const { meta } = entry;

  return (
    <StudyCard
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditingNote(false);
      }}
      count={cards.length}
      index={Math.max(0, found)}
      onIndexChange={(next) => {
        if (!cards[next]) return;
        setCurrentKey(cards[next].key);
        setEditingNote(false);
      }}
      itemKey={entry.key}
      labels={{ group: '切换题目', prev: '上一题', next: '下一题' }}
      data-solution-card=""
      size="xl"
      height="46rem"
      className="text-base"
      finalFocus={() => {
        // A question the reader paged to may be out of layout (the reading card).
        const question = document.getElementById(`question-${meta.id}`);
        if (question) revealQuestion(question);
        return entry.trigger.current ?? self.trigger.current ?? true;
      }}
    >
      <EntryScope entry={entry}>
        <StudyCardHeader
          title={
            meta.number ? (
              <>
                <span data-question-number="" aria-hidden="true">
                  {meta.number}
                </span>
                <span className="sr-only">第 {meta.number} 题</span>
              </>
            ) : (
              '题目与解析'
            )
          }
          tags={
            // One glass capsule for all of them: each blurred layer costs a pass on every scrolled frame.
            <>
              <span data-tag-capsule="">
                <QuestionTypeTag type={meta.type} points={meta.points} />
                <QuestionSourceTrail tags={meta.tags.source} />
                <QuestionUserTags />
              </span>
              <div className="rounded-full bg-(--modal-glass) px-1 md:hidden">
                <QuestionMarkActions editingNote={editingNote} onEditNote={() => setEditingNote(!editingNote)} />
              </div>
            </>
          }
          tagsProps={{ 'aria-label': '标签' }}
          actionsLabel="题目操作"
          actions={
            <>
              <div className="hidden md:block">
                <QuestionMarkActions editingNote={editingNote} onEditNote={() => setEditingNote(!editingNote)} />
              </div>

              <IconButton
                className={iconAction}
                aria-expanded={library === 'open'}
                aria-label="收藏与标签"
                title="收藏与标签"
                onClick={() => setLibrary('open')}
              >
                <ActionIcon icon={LibraryBigIcon} animatedIcon={AnimatedLibraryBigIcon} />
              </IconButton>
            </>
          }
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
          <QuestionLibraryDialog
            open={library === 'open'}
            onOpenChange={(next) => setLibrary(next ? 'open' : 'mounted')}
          />
        </Suspense>
      ) : null}
    </StudyCard>
  );
}

type NoteProps = { editing: boolean; setEditing: (editing: boolean) => void };

/** The reader's note, editable in place inside the sheet. */
function SheetNote({ editing, setEditing }: NoteProps) {
  const marks = useMarks();
  if (!marks) return null;
  const note = marks.mark?.note ?? '';
  return (
    <StudyCardSection
      label="我的注释"
      meta={
        !editing ? (
          <RippleButton
            variant="ghost"
            size="xs"
            className="-my-1 text-muted-foreground"
            onClick={() => setEditing(true)}
            disabled={!marks.ready}
          >
            <ActionIcon icon={NotebookPenIcon} animatedIcon={AnimatedNotebookPenIcon} data-icon="inline-start" />
            {note ? '编辑' : '添加'}
          </RippleButton>
        ) : null
      }
    >
      {editing ? (
        <NoteEditor
          initial={note}
          onCancel={() => setEditing(false)}
          onSave={async (next) => {
            if (await marks.update({ note: next })) setEditing(false);
          }}
        />
      ) : note ? (
        <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">{note}</p>
      ) : (
        <p className="text-sm text-muted-foreground">还没有注释。记下思路或易错点，下次复习一眼可见。</p>
      )}
    </StudyCardSection>
  );
}

/** One card's panes. Kept as rendered while the card leaves, with the scope it was given. */
function SolutionCardBody({
  entry,
  desktop,
  editingNote,
  setEditingNote,
}: {
  entry: SolutionEntry;
  desktop: boolean;
  editingNote: boolean;
  setEditingNote: (editing: boolean) => void;
}) {
  const { meta, state, solution } = entry;
  const points = meta.tags.point;
  const spec = state?.spec ?? null;
  const essay = spec?.kind === 'self';
  const note = <SheetNote editing={editingNote} setEditing={setEditingNote} />;
  return (
    <>
      <StudyCardAside className="@container">
        <StudyCardSection label="题目">
          <QuestionMirror questionId={meta.id} state={state} className={prose} />
        </StudyCardSection>
        {points.length ? (
          <StudyCardSection label="考点" meta={`${points.length} 个`}>
            <QuestionPointTags tags={points} />
          </StudyCardSection>
        ) : null}
        {desktop ? note : null}
      </StudyCardAside>

      <StudyCardMain>
        {spec && !essay ? (
          <StudyCardSection label="答案">
            <AnswerSummary spec={spec} state={state} />
          </StudyCardSection>
        ) : null}
        <StudyCardSection label={spec && !essay ? '解析' : '参考解答'}>
          <div className={cn(prose, '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden')}>
            {solution}
          </div>
        </StudyCardSection>
        {essay ? (
          // Read the reference first, then grade yourself against it.
          <StudyCardSection label="自评" meta={state?.submitted ? '可随时改' : '对照参考解答'}>
            <SelfGrade />
          </StudyCardSection>
        ) : null}
        {desktop ? null : note}
      </StudyCardMain>
    </>
  );
}
