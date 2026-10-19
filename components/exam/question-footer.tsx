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
import { type AttemptResult, useExamQuestion } from './question-state';
import { ExamSolutionDialog } from './solution-dialog';

const resultCopy: Record<AttemptResult, { icon: ReactNode; text: string; className: string }> = {
  correct: { icon: <CircleCheckIcon />, text: '回答正确', className: 'text-success' },
  partial: { icon: <CircleAlertIcon />, text: '少选了', className: 'text-foreground' },
  incorrect: { icon: <CircleXIcon />, text: '回答错误', className: 'text-destructive' },
};

/** Left side of the footer: multi-select submit, then the graded result. */
function AttemptStatus() {
  const question = useExamQuestion();
  if (!question?.answerKey) return null;

  const { answerKey, multiple, selected, submitted, result, attempt, submit, reset } = question;

  if (!submitted || !result) {
    if (!multiple) return null;
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">多选</Badge>
        <Button variant="outline" size="sm" disabled={selected.length === 0} onClick={submit}>
          提交答案
        </Button>
      </div>
    );
  }

  const copy = resultCopy[result];
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
          正确答案 <span className="font-medium text-foreground">{answerKey.join('')}</span>
        </span>
      ) : null}
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={reset}>
        <RotateCcwIcon data-icon="inline-start" />
        重做
      </Button>
    </div>
  );
}

export function ExamQuestionFooter({
  question,
  answer,
  explanation,
  buttonLabel,
  dialogTitle,
}: {
  question: ReactNode;
  answer: ReactNode | null;
  explanation: ReactNode;
  buttonLabel: string;
  dialogTitle: string;
}) {
  const state = useExamQuestion();

  return (
    <div className="mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
      <div role="status" aria-live="polite" className="min-w-0 flex-1">
        <AttemptStatus />
      </div>
      <ExamSolutionDialog
        question={question}
        answer={answer}
        explanation={explanation}
        buttonLabel={buttonLabel}
        dialogTitle={dialogTitle}
        preview={answer !== null && !state?.answerKey}
      />
    </div>
  );
}
