'use client';

import { BookOpenTextIcon, CheckIcon, XIcon } from 'lucide-react';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { questionStemClassName } from './model';
import { QuestionReveal, useQuestionState } from './question-state';
import { useSheetDrag } from './use-sheet-drag';

type QuestionSolutionDialogProps = {
  question: ReactNode;
  /** Short answer (option letters, blank answers); null for essays. */
  answer: ReactNode | null;
  solution: ReactNode;
  /** Heading of the solution section: 解析 beside an answer, else 解答. */
  solutionLabel: string;
  buttonLabel: string;
  dialogTitle: string;
  /** Display number of the question ("3", "例 1"), if any. */
  numberLabel?: string | null;
  /** 单选题 / 多选题 / …, shown beside the title. */
  typeLabel?: string;
};

/*
 * Sheet and backdrop share one curve and clock, so the dimming tracks the
 * sheet in both directions: a long, settling rise and a quicker drop.
 */
const sheetEase = 'ease-[cubic-bezier(0.32,0.72,0,1)]';

const overlayClassName = cn(
  'data-open:animate-none! data-closed:animate-none!',
  'transition-opacity duration-500',
  sheetEase,
  'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[340ms]',
  'motion-reduce:transition-none',
);

// The sheet is portaled out of #docs-body. `docs-prose` makes it pick up the
// same typography rules as the page (headings, tables, code, callouts, math),
// so a solution reads exactly like it does in the document.
const prose = 'prose docs-prose max-w-none min-w-0';
const proseReset = '[&>:first-child]:mt-0 [&>:last-child]:mb-0';

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-xs font-medium tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md bg-(--ui-fill) px-2 text-xs font-medium text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

/** What the reader submitted, in the same notation as the key. */
function useReaderAnswer(): { text: string; correct: boolean } | null {
  const state = useQuestionState();
  if (!state?.submitted || !state.result) return null;
  const { spec } = state;
  let text: string;
  if (spec.kind === 'choice') {
    // Boolean questions grade letters (A = 正确, B = 错误) but show words.
    text = spec.keyText && !spec.multiple
      ? (state.selected[0] === 'A' ? '正确' : '错误')
      : [...state.selected].sort().join('');
  } else {
    text = spec.blanks.map((_, index) => state.values[index]?.trim() || '—').join('；');
  }
  return { text, correct: state.result === 'correct' };
}

/* Each pane scrolls on its own on desktop; on mobile the whole body scrolls. */
const paneClassName =
  'min-w-0 px-5 pt-5 pb-8 md:overflow-y-auto md:overscroll-contain md:px-7 md:pt-6 [scrollbar-width:thin]';

export function QuestionSolutionDialog({
  question,
  answer,
  solution,
  solutionLabel,
  buttonLabel,
  dialogTitle,
  numberLabel,
  typeLabel,
}: QuestionSolutionDialogProps) {
  const [open, setOpen] = useState(false);
  const reader = useReaderAnswer();
  const sheetRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const dragHandlers = useSheetDrag(sheetRef, close);

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="bg-(--ui-fill) px-3 text-foreground/80 hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active)"
    />
  );
  const triggerContent = (
    <>
      <BookOpenTextIcon data-icon="inline-start" />
      {buttonLabel}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger}>{triggerContent}</DialogTrigger>

      <DialogContent
        ref={sheetRef}
        showCloseButton={false}
        overlayClassName={overlayClassName}
        className={cn(
          'flex flex-col gap-0 overflow-hidden bg-(--ui-panel) p-0 text-base text-foreground ring-0 will-change-transform',
          // Lit from below the fold: the shadow falls upward, and in dark mode a
          // hairline edge lifts the black sheet off the dimmed page.
          'shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.22)] dark:shadow-[0_-12px_40px_-8px_rgb(0_0_0/0.8)] dark:ring-1 dark:ring-white/10',
          /*
           * A bottom sheet at every size: anchored to the bottom edge, centred
           * on desktop and full width on phones. It rises the full height on
           * CSS transitions keyed to Base UI's starting/ending styles, so a
           * close can start from wherever a drag left it; the stock keyframe
           * zoom/fade is switched off.
           */
          'top-auto bottom-0 left-1/2 w-[min(72rem,100vw-2rem)] max-w-none translate-y-0 rounded-t-[1.25rem] rounded-b-none sm:max-w-none',
          // Sized to its content, up to a gap above that keeps the page in view.
          'max-h-[min(52rem,calc(100dvh-3rem))] md:min-h-[min(26rem,calc(100dvh-3rem))] max-md:left-0 max-md:max-h-[calc(100dvh-2.5rem)] max-md:w-full max-md:translate-x-0',
          'data-open:animate-none! data-closed:animate-none!',
          'transition-[translate,transform] duration-500',
          sheetEase,
          'data-starting-style:translate-y-full data-ending-style:translate-y-full data-ending-style:duration-[340ms]',
          'motion-reduce:transition-none',
        )}
      >
        {/* Grab zone: handle and header follow the pointer. */}
        <div className="shrink-0 touch-none select-none md:cursor-grab md:active:cursor-grabbing" {...dragHandlers}>
          <div aria-hidden="true" className="flex justify-center pt-2.5 pb-1">
            <div className="h-1.5 w-10 rounded-full bg-(--ui-fill-strong)" />
          </div>
          <header className="flex min-h-12 items-center gap-2.5 pr-3 pb-1 pl-5 md:pl-7">
            <DialogTitle className="text-base font-medium">{dialogTitle}</DialogTitle>
            {numberLabel ? <Chip>第 {numberLabel} 题</Chip> : null}
            {typeLabel ? <Chip>{typeLabel}</Chip> : null}
            <DialogClose
              render={<Button variant="ghost" size="icon-sm" className="ml-auto size-8 rounded-full bg-(--ui-fill) text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground" />}
            >
              <XIcon />
              <span className="sr-only">关闭</span>
            </DialogClose>
          </header>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-rows-[minmax(0,1fr)] max-md:overflow-y-auto max-md:overscroll-contain max-md:pb-[env(safe-area-inset-bottom)] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section
            aria-label="题目"
            className={cn(paneClassName, 'bg-(--exam-question-pane) @container')}
          >
            <SectionLabel>题目</SectionLabel>
            <div className={cn(prose, questionStemClassName)}>
              <QuestionReveal>{question}</QuestionReveal>
            </div>
          </section>

          <section aria-label="解答" className={cn(paneClassName, 'flex flex-col gap-7 bg-(--exam-question-solution-pane)')}>
            {answer !== null ? (
              <div className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 delay-75">
                <SectionLabel>答案</SectionLabel>
                <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
                  <div
                    className={cn(
                      prose,
                      'flex items-baseline gap-3 rounded-(--ui-radius-control) bg-success/10 px-4 py-3 leading-relaxed [&_b]:font-normal [&_strong]:font-normal',
                      '[&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto',
                    )}
                  >
                    <span className="shrink-0 text-sm text-success">正确答案</span>
                    <span className="min-w-0 text-lg font-semibold text-foreground">{answer}</span>
                  </div>
                  {reader ? (
                    <div
                      className={cn(
                        'flex items-baseline gap-3 rounded-(--ui-radius-control) px-4 py-3 leading-relaxed',
                        reader.correct ? 'bg-(--ui-fill)' : 'bg-destructive/8',
                      )}
                    >
                      <span className="shrink-0 text-sm text-muted-foreground">你的答案</span>
                      <span className="min-w-0 text-lg font-semibold break-words">{reader.text}</span>
                      <span
                        className={cn(
                          'ml-auto grid size-5 shrink-0 place-items-center self-center rounded-full text-background [&_svg]:size-3',
                          reader.correct ? 'bg-success' : 'bg-destructive',
                        )}
                        aria-label={reader.correct ? '正确' : '错误'}
                      >
                        {reader.correct ? <CheckIcon strokeWidth={3} /> : <XIcon strokeWidth={3} />}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 delay-150">
              <SectionLabel>{solutionLabel}</SectionLabel>
              <div className={cn(prose, proseReset, '[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden')}>
                {solution}
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
