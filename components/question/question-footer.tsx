'use client';

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  RotateCcwIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type AttemptResult, useQuestionState } from './question-state';
import { QuestionSolutionDialog } from './solution-dialog';

const choiceCopy: Record<AttemptResult, { icon: ReactNode; text: string; className: string }> = {
  correct: { icon: <CircleCheckIcon />, text: '回答正确', className: 'text-success' },
  partial: { icon: <CircleAlertIcon />, text: '少选了', className: 'text-foreground' },
  incorrect: { icon: <CircleXIcon />, text: '回答错误', className: 'text-destructive' },
};

const blankCopy: Record<AttemptResult, { icon: ReactNode; text: string; className: string }> = {
  correct: choiceCopy.correct,
  partial: { icon: <CircleAlertIcon />, text: '部分正确', className: 'text-foreground' },
  incorrect: choiceCopy.incorrect,
};

/** The key as shown to the reader: letters for choices, answers for blanks. */
export function formatKey(spec: NonNullable<ReturnType<typeof useQuestionState>>['spec']) {
  return spec.kind === 'choice'
    ? (spec.keyText ?? spec.key.join(''))
    : spec.blanks.map((blank) => blank.answer).join('；');
}

/** Left side of the footer: submit button, then the graded result. */
function AttemptStatus() {
  const question = useQuestionState();
  if (!question) return null;

  const { spec, submitted, result, attempt, canSubmit, submit, reset } = question;
  const needsSubmit = spec.kind === 'blank' || spec.multiple;

  if (!submitted || !result) {
    if (!needsSubmit) return null;
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{spec.kind === 'blank' ? '填空' : '多选'}</Badge>
        <Button size="sm" disabled={!canSubmit} onClick={submit}>
          提交答案
        </Button>
      </div>
    );
  }

  const copy = (spec.kind === 'blank' ? blankCopy : choiceCopy)[result];
  return (
    <div
      key={attempt}
      className="flex items-center gap-2 animate-in fade-in-0 slide-in-from-left-1 duration-300"
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0',
          copy.className,
        )}
      >
        {copy.icon}
        {copy.text}
      </span>
      {result !== 'correct' ? (
        <span className="text-sm text-muted-foreground">
          正确答案 <span className="font-medium text-foreground">{formatKey(spec)}</span>
        </span>
      ) : null}
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={reset}>
        <RotateCcwIcon data-icon="inline-start" />
        重做
      </Button>
    </div>
  );
}

export function QuestionFooter({
  question,
  answer,
  solution,
  solutionLabel,
  buttonLabel,
  dialogTitle,
  showSolution = true,
}: {
  question: ReactNode;
  answer: ReactNode | null;
  solution: ReactNode;
  solutionLabel: string;
  buttonLabel: string;
  dialogTitle: string;
  showSolution?: boolean;
}) {
  const state = useQuestionState();
  return (
    <div className="mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
      <div role="status" aria-live="polite" className="min-w-0 flex-1">
        <AttemptStatus />
        {state?.storageError ? <p role="alert" className="mt-1 text-sm text-destructive">{state.storageError}</p> : null}
      </div>
      {showSolution ? <QuestionSolutionDialog
        question={question}
        answer={answer}
        solution={solution}
        solutionLabel={solutionLabel}
        buttonLabel={buttonLabel}
        dialogTitle={dialogTitle}
      /> : null}
    </div>
  );
}
