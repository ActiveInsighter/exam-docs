'use client';

import { BookOpenTextIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { QuestionReveal } from './question-state';

type QuestionSolutionDialogProps = {
  question: ReactNode;
  /** Short answer (option letters, blank answers); null for essays. */
  answer: ReactNode | null;
  solution: ReactNode;
  /** Heading of the solution section: 解析 beside an answer, else 解答. */
  solutionLabel: string;
  buttonLabel: string;
  dialogTitle: string;
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
}: QuestionSolutionDialogProps) {
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-foreground"
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
          'max-md:inset-0 max-md:size-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0',
          'max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-8 max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom-8',
        )}
      >
        <header className="flex h-14 shrink-0 items-center pr-12 pl-5 md:pl-7">
          <DialogTitle className="text-base font-medium">{dialogTitle}</DialogTitle>
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
                <div
                  className={cn(
                    prose,
                    'rounded-(--ui-radius-control) bg-success/10 px-4 py-3 text-lg leading-relaxed [&_b]:font-normal [&_strong]:font-normal',
                    proseReset,
                    '[&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto',
                  )}
                >
                  {answer}
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
