'use client';

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  RotateCcwIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type AttemptResult, useQuestionState } from './question-state';
import { QuestionSolutionDialog } from './solution-dialog';

type Copy = { icon: ReactNode; text: string; className: string };

/* Result pills: tinted fill, coloured text, no outline. */
const choiceCopy: Record<AttemptResult, Copy> = {
  correct: { icon: <CircleCheckIcon />, text: '回答正确', className: 'bg-success/12 text-success' },
  partial: { icon: <CircleAlertIcon />, text: '少选了', className: 'bg-(--ui-fill-strong) text-foreground' },
  incorrect: { icon: <CircleXIcon />, text: '回答错误', className: 'bg-destructive/10 text-destructive' },
};

const blankCopy: Record<AttemptResult, Copy> = {
  correct: choiceCopy.correct,
  partial: { ...choiceCopy.partial, text: '部分正确' },
  incorrect: choiceCopy.incorrect,
};

/** The key as shown to the reader: letters for choices, answers for blanks. */
export function formatKey(spec: NonNullable<ReturnType<typeof useQuestionState>>['spec']) {
  return spec.kind === 'choice'
    ? (spec.keyText ?? spec.key.join(''))
    : spec.blanks.map((blank) => blank.answer).join('；');
}

/** Coarse state published on the footer for page-level navigators. */
export type AttemptStatus = 'idle' | 'draft' | AttemptResult;

function useAttemptStatus(): AttemptStatus | undefined {
  const question = useQuestionState();
  if (!question) return undefined;
  if (question.submitted && question.result) return question.result;
  const touched = question.spec.kind === 'choice'
    ? question.selected.length > 0
    : question.values.some((value) => value.trim() !== '');
  return touched ? 'draft' : 'idle';
}

/** Left side of the footer: submit button, then the graded result. */
function AttemptStatusView() {
  const question = useQuestionState();
  if (!question) return null;

  const { spec, submitted, result, attempt, canSubmit, submit, reset, selected } = question;
  const needsSubmit = spec.kind === 'blank' || spec.multiple;

  if (!submitted || !result) {
    if (!needsSubmit) return null;
    const hint = spec.kind === 'blank'
      ? '填空题 · 回车提交'
      : selected.length > 0 ? `多选题 · 已选 ${selected.length} 项` : '多选题 · 选出全部正确项';
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="sm" disabled={!canSubmit} onClick={submit} className="px-3.5">
          提交答案
        </Button>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </div>
    );
  }

  const copy = (spec.kind === 'blank' ? blankCopy : choiceCopy)[result];
  return (
    <div
      key={attempt}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 animate-in fade-in-0 slide-in-from-left-1 duration-300"
    >
      <span
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-full pr-3 pl-2 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0',
          'motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-300',
          copy.className,
        )}
      >
        {copy.icon}
        {copy.text}
      </span>
      {result !== 'correct' ? (
        <span className="text-sm text-muted-foreground">
          正确答案 <span className="font-semibold text-foreground">{formatKey(spec)}</span>
        </span>
      ) : null}
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reset}>
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
  numberLabel,
  typeLabel,
}: {
  question: ReactNode;
  answer: ReactNode | null;
  solution: ReactNode;
  solutionLabel: string;
  buttonLabel: string;
  dialogTitle: string;
  showSolution?: boolean;
  numberLabel?: string | null;
  typeLabel?: string;
}) {
  const state = useQuestionState();
  const status = useAttemptStatus();
  return (
    <div
      data-question-footer=""
      data-attempt-result={status}
      className="mt-4 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2"
    >
      <div role="status" aria-live="polite" className="min-w-0 flex-1">
        <AttemptStatusView />
        {state?.storageError ? <div className="mt-1 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">{state.storageError}</p>
          <Button variant="outline" size="sm" onClick={state.retryStorage}>重试保存</Button>
        </div> : null}
      </div>
      {showSolution ? <QuestionSolutionDialog
        question={question}
        answer={answer}
        solution={solution}
        solutionLabel={solutionLabel}
        buttonLabel={buttonLabel}
        dialogTitle={dialogTitle}
        numberLabel={numberLabel}
        typeLabel={typeLabel}
      /> : null}
    </div>
  );
}
