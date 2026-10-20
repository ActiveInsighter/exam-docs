'use client';

import { BookOpenTextIcon, CheckIcon, XIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { QuestionReveal, useQuestionState } from './question-state';

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

// The popup is portaled out of #docs-body, so content opts back into the
// Fumadocs typography explicitly.
const prose = 'prose max-w-none min-w-0 text-[1.0625rem] leading-[1.85]';
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
        className={cn(
          'flex flex-col gap-0 overflow-hidden bg-(--ui-panel) p-0 text-base text-foreground shadow-(--ui-shadow-overlay) duration-200 ease-out',
          'h-[min(48rem,calc(100dvh-4rem))] w-[min(72rem,calc(100vw-2rem))] max-w-none sm:max-w-none rounded-(--ui-radius-panel)',
          // Phones: a bottom sheet that leaves a strip of the page visible.
          'max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:h-[calc(100dvh-2.5rem)] max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:ring-0',
          'max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-1/4 max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom-1/4',
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-(--ui-fill-strong) md:hidden" />
        <header className="flex min-h-14 shrink-0 items-center gap-2.5 pr-12 pl-5 max-md:min-h-12 md:pl-7">
          <DialogTitle className="text-base font-medium">{dialogTitle}</DialogTitle>
          {numberLabel ? <Chip>第 {numberLabel} 题</Chip> : null}
          {typeLabel ? <Chip>{typeLabel}</Chip> : null}
        </header>

        <div className="grid min-h-0 flex-1 max-md:overflow-y-auto max-md:overscroll-contain md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section
            aria-label="题目"
            className={cn(paneClassName, 'bg-(--exam-question-pane) @container')}
          >
            <SectionLabel>题目</SectionLabel>
            <div className={cn(prose, proseReset)}>
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
