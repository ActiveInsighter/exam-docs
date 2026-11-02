'use client';

import { useQuestionState } from './question-state';

/**
 * The question's number as a key-cap that reflects the attempt: ink while
 * unanswered, a ring once something is entered, and the result's colour
 * after grading, so a page's progress can be read down the left edge.
 * Looks in styles/question.css.
 */
export function QuestionNumber({ questionId, label }: { questionId: string; label: string }) {
  const question = useQuestionState();
  const result = question?.submitted && question.evaluation
    ? question.evaluation.result
    : question?.answered ? 'draft' : undefined;
  return (
    <span
      id={`question-${questionId}-label`}
      data-question-number=""
      data-result={result}
      data-fresh={question?.fresh ? '' : undefined}
      aria-label={`第 ${label} 题`}
    >
      {label}
    </span>
  );
}
