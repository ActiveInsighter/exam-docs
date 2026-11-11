'use client';

import type { ReactNode } from 'react';
import { blankBadge } from './blank-field';
import { BlankEntry, BlankGradeSwitch, BlankKey } from './blank-grade';
import { ResultIcon } from './grade-control';
import { type AttemptResult, formatKey, formatResponse, type GradingSpec } from './grading';
import type { QuestionState } from './question-state';

const RESULT_LABELS: Record<AttemptResult, string> = { correct: '正确', partial: '部分正确', incorrect: '错误' };

/** Shared answer surface: the data attributes also work in the read-only mirror. */
function AnswerTile({
  as: Tag = 'div',
  tone,
  children,
}: {
  as?: 'div' | 'li';
  tone?: AttemptResult;
  children: ReactNode;
}) {
  return (
    <Tag data-answer-tile="" data-tone={tone}>
      {children}
    </Tag>
  );
}

function BlankAnswers({ state }: { state: QuestionState }) {
  if (state.spec.kind !== 'blank') return null;
  const graded = Boolean(state.evaluation);
  return (
    <ol data-answers="blank" aria-label="逐空对照答案">
      {state.spec.blanks.map((blank, index) => {
        const verdict = state.evaluation?.blanks[index];
        const yours = graded ? state.values[index]?.trim() : '';
        return (
          <AnswerTile as="li" key={index} tone={verdict && verdict !== 'correct' ? 'incorrect' : undefined}>
            {state.spec.kind === 'blank' && state.spec.blanks.length > 1 ? <small>{blankBadge(index)}</small> : null}
            <small data-answer-label="key">答案</small>
            <strong>
              <BlankKey blank={blank} />
            </strong>
            {state.ready ? (
              <span data-answer-yours="">
                <small>{graded ? '你填' : '自评'}</small>
                {graded ? <span>{yours ? <BlankEntry blank={blank} value={yours} /> : '—'}</span> : null}
                <BlankGradeSwitch question={state} index={index} />
              </span>
            ) : null}
          </AnswerTile>
        );
      })}
    </ol>
  );
}

/** Reference and response stay separate; grading behavior lives in GradeControl. */
export function AnswerSummary({ spec, state }: { spec: GradingSpec; state: QuestionState | null }) {
  if (spec.kind === 'blank') {
    if (state) return <BlankAnswers state={state} />;
    return (
      <ol data-answers="blank" aria-label="逐空对照答案">
        {spec.blanks.map((blank, index) => (
          <AnswerTile as="li" key={index}>
            <small>{blankBadge(index)} 答案</small>
            <strong>
              <BlankKey blank={blank} />
            </strong>
          </AnswerTile>
        ))}
      </ol>
    );
  }

  const result = state?.evaluation?.result;
  const letters = spec.kind === 'choice' ? '' : undefined;
  return (
    <div data-answers="" aria-label="答案对照">
      <AnswerTile tone="correct">
        <small data-answer-label="key">正确答案</small>
        <strong data-choice-letters={letters}>{formatKey(spec)}</strong>
      </AnswerTile>
      {state && result ? (
        <AnswerTile tone={result === 'correct' ? undefined : result}>
          <small>你的答案</small>
          <strong data-choice-letters={state.selected.length ? letters : undefined}>
            {formatResponse(spec, state.selected, state.values)}
          </strong>
          <span data-answer-verdict="" data-tone={result} aria-label={RESULT_LABELS[result]} role="img">
            <ResultIcon result={result} animate={state.fresh} />
          </span>
        </AnswerTile>
      ) : null}
    </div>
  );
}
