'use client';

import { CheckIcon, MinusIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { blankBadge } from './blank-field';
import { BlankEntry, BlankGradeSwitch, BlankKey } from './blank-grade';
import { type AttemptResult, formatKey, formatResponse, type GradingSpec } from './grading';
import type { QuestionState } from './question-state';

/*
 * The answer section of the solution card: the key beside what the reader
 * submitted, as tiles in the result's tone (styles/question/solution.css).
 * Blanks get a row each, with the switch for grading by hand.
 */

const VERDICTS: Record<AttemptResult, { label: string; icon: ReactNode }> = {
  correct: { label: '正确', icon: <CheckIcon strokeWidth={3} /> },
  partial: { label: '部分正确', icon: <MinusIcon strokeWidth={3} /> },
  incorrect: { label: '错误', icon: <XIcon strokeWidth={3} /> },
};

export function AnswerSummary({ spec, state }: { spec: GradingSpec; state: QuestionState | null }) {
  const graded = state?.evaluation ? state : null;
  const letters = spec.kind === 'choice' ? '' : undefined;

  if (spec.kind === 'blank') {
    // Not answered on the page: grade yourself against the key here, as with an essay.
    const gradable = graded ?? (state?.ready && !state.deferred ? state : null);
    return (
      <ol data-answers="blank">
        {spec.blanks.map((blank, index) => {
          const verdict = graded?.evaluation?.blanks[index];
          const yours = graded?.values[index]?.trim();
          return (
            <li key={index} data-answer-tile="" data-tone={verdict && verdict !== 'correct' ? 'incorrect' : undefined}>
              {spec.blanks.length > 1 ? <small>{blankBadge(index)}</small> : null}
              <small data-answer-label="key">答案</small>
              <strong><BlankKey blank={blank} /></strong>
              {gradable ? (
                <span data-answer-yours="">
                  <small>{graded ? '你填' : '自评'}</small>
                  {graded ? <span>{yours ? <BlankEntry blank={blank} value={yours} /> : '—'}</span> : null}
                  <BlankGradeSwitch question={gradable} index={index} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  }

  const result = graded?.evaluation?.result;
  return (
    <div data-answers="">
      <div data-answer-tile="" data-tone="correct">
        <small data-answer-label="key">正确答案</small>
        <strong data-choice-letters={letters}>{formatKey(spec)}</strong>
      </div>
      {graded && result ? (
        <div data-answer-tile="" data-tone={result === 'correct' ? undefined : result}>
          <small>你的答案</small>
          <strong data-choice-letters={graded.selected.length ? letters : undefined}>{formatResponse(spec, graded.selected, graded.values)}</strong>
          <span data-answer-verdict="" data-tone={result} aria-label={VERDICTS[result].label} role="img">{VERDICTS[result].icon}</span>
        </div>
      ) : null}
    </div>
  );
}
