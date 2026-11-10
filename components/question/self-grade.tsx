'use client';

import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SELF_GRADES, type AttemptResult } from './grading';
import { useQuestionState } from './question-state';

/** One icon per result, shared by the grade buttons and the result pill. */
export const RESULT_ICONS: Record<AttemptResult, ReactNode> = {
  correct: <CircleCheckIcon aria-hidden="true" />,
  partial: <CircleAlertIcon aria-hidden="true" />,
  incorrect: <CircleXIcon aria-hidden="true" />,
};

/**
 * An essay is graded by the reader against the reference solution: 正确,
 * 部分正确 or 错误, kept like any other answer (selected = its letter).
 * Picking another grade later records a new attempt.
 */
export function SelfGrade() {
  const question = useQuestionState();
  if (question?.spec.kind !== 'self') return null;
  const picked = question.submitted ? question.selected[0] : undefined;
  return (
    <div role="group" aria-label="自评" data-self-grade="">
      {SELF_GRADES.map((grade) => (
        <button
          key={grade.letter}
          type="button"
          data-tone={grade.result}
          aria-pressed={picked === grade.letter}
          disabled={!question.ready}
          onClick={() => question.select([grade.letter])}
        >
          {RESULT_ICONS[grade.result]}
          {grade.label}
        </button>
      ))}
    </div>
  );
}
