'use client';

import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SELF_GRADES, type AttemptResult } from './grading';
import { useQuestionState } from './question-state';

const GRADE_ICONS: Record<AttemptResult, ReactNode> = {
  correct: <CircleCheckIcon aria-hidden="true" />,
  partial: <CircleAlertIcon aria-hidden="true" />,
  incorrect: <CircleXIcon aria-hidden="true" />,
};

/**
 * An essay is graded by the reader against the reference solution: 正确,
 * 部分正确 or 错误, kept like any other answer (selected = its letter).
 */
export function SelfGrade({ className }: { className?: string }) {
  const question = useQuestionState();
  if (question?.spec.kind !== 'self') return null;
  const picked = question.submitted ? question.selected[0] : undefined;
  return (
    <div role="group" aria-label="自评" data-self-grade="" className={className}>
      {SELF_GRADES.map((grade) => (
        <button
          key={grade.letter}
          type="button"
          data-grade={grade.result}
          aria-pressed={picked === grade.letter}
          disabled={!question.ready}
          onClick={() => {
            if (picked === grade.letter) return;
            // A changed grade is a new attempt, so it replays and syncs like a resubmission.
            if (question.submitted) question.reset();
            question.select([grade.letter]);
          }}
        >
          {GRADE_ICONS[grade.result]}
          {grade.label}
        </button>
      ))}
    </div>
  );
}
