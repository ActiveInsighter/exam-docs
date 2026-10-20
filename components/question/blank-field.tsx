'use client';

import { useQuestionReveal, useQuestionState } from './question-state';
import { cn } from '@/lib/utils';

/**
 * One blank of a `blank` question: an inline input while answering, the
 * answer itself inside the solution dialog.
 */
export function BlankField({ answer, index }: { answer: string; index: number }) {
  const question = useQuestionState();
  const reveal = useQuestionReveal();
  const label = `第 ${index + 1} 空`;

  if (reveal) {
    return (
      <span
        className="mx-1 inline-block rounded-sm bg-success/12 px-1.5 font-medium text-success ring-1 ring-inset ring-success/40"
        data-question-blank=""
        aria-label={`${label}答案`}
      >
        {answer}
      </span>
    );
  }

  if (!question || question.spec.kind !== 'blank') {
    return (
      <span
        className="mx-1 inline-block min-w-12 border-b border-foreground/50 align-baseline"
        data-question-blank=""
        aria-label={label}
      >
        {' '}
      </span>
    );
  }

  const value = question.values[index] ?? '';
  const state = question.submitted
    ? question.blankResults[index]
      ? 'correct'
      : 'incorrect'
    : 'idle';

  return (
    <input
      type="text"
      value={value}
      disabled={question.submitted || !question.ready}
      onChange={(event) => question.setValue(index, event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') question.submit();
      }}
      aria-label={label}
      aria-invalid={state === 'incorrect' || undefined}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      maxLength={8192}
      data-question-blank=""
      data-feedback={state}
      style={{ width: `${Math.min(Math.max(answer.length, 3) + 2, 24)}ch` }}
      className={cn(
        'mx-1 inline-block max-w-full rounded-none border-0 border-b bg-transparent px-1 text-center align-baseline text-[length:inherit] outline-none transition-colors',
        'border-foreground/50 focus-visible:border-primary focus-visible:bg-primary/5',
        state === 'correct' && 'border-success bg-success/12 text-success',
        state === 'incorrect' && 'border-destructive bg-destructive/10 text-destructive',
      )}
    />
  );
}
