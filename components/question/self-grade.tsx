'use client';

import { GradeControl } from './grade-control';
import { SELF_GRADES } from './grading';
import { useQuestionState } from './question-state';

const ITEMS = SELF_GRADES.map((grade) => ({ value: grade.letter, label: grade.label, result: grade.result }));

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
      <GradeControl label="自评" items={ITEMS} value={picked} disabled={!question.ready} onChange={(value) => question.select([value])} />
    </div>
  );
}
