'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { blankBadge } from './blank-field';
import type { BlankGrade } from './grading';
import { MathPreview } from './math-preview';
import type { QuestionState } from './question-state';

/*
 * Manual grading of a submitted blank question: per blank, 判对 / 判错 as a
 * two-way switch showing the grade in force. Picking the checker's own grade
 * drops the override (question-state.tsx), so "已改判" only marks real
 * changes. Shown under the footer on the page and beside each answer in the
 * solution card.
 */

export function BlankGradeSwitch({ question, index }: { question: QuestionState; index: number }) {
  const verdict = question.evaluation?.blanks[index];
  const manual = question.evaluation?.manual?.[index] ?? false;
  const current: BlankGrade = verdict === 'correct' ? 'correct' : 'incorrect';
  const label = question.spec.kind === 'blank' && question.spec.blanks.length > 1 ? `第 ${index + 1} 空` : '本题';
  const choose = (grade: BlankGrade) => {
    if (grade !== current) question.gradeBlank(index, grade);
  };
  return (
    <span role="group" aria-label={`手动判分 · ${label}`} data-blank-grade="" data-manual={manual ? '' : undefined}>
      <button type="button" data-grade="correct" aria-pressed={current === 'correct'} disabled={!question.ready} onClick={() => choose('correct')}>
        <CheckIcon aria-hidden="true" />判对
      </button>
      <button type="button" data-grade="incorrect" aria-pressed={current === 'incorrect'} disabled={!question.ready} onClick={() => choose('incorrect')}>
        <XIcon aria-hidden="true" />判错
      </button>
    </span>
  );
}

/** Every blank of a submitted question with what was entered and its switch. */
export function ManualGradePanel({ question }: { question: QuestionState }) {
  if (question.spec.kind !== 'blank' || !question.submitted || !question.evaluation) return null;
  const { blanks } = question.spec;
  return (
    <div data-manual-grade="" role="group" aria-label="手动判分">
      <p data-manual-grade-hint="">对照参考答案，自动判分有误时可逐空改判；改判随作答记录保存。</p>
      <ul>
        {blanks.map((blank, index) => {
          const value = question.values[index]?.trim() ?? '';
          return (
            <li key={index}>
              {blanks.length > 1 ? <span data-manual-grade-badge="">{blankBadge(index)}</span> : null}
              <span data-manual-grade-value="">
                {value ? (blank.kind === 'math' ? <MathPreview text={value} /> : value) : <span data-manual-grade-empty="">未作答</span>}
              </span>
              {question.evaluation?.manual?.[index] ? <span data-manual-grade-note="">已改判</span> : null}
              <BlankGradeSwitch question={question} index={index} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
