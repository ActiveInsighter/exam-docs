'use client';

import { type KeyboardEvent, useCallback } from 'react';
import type { BlankKind, BlankVerdict } from './grading';
import { advanceFrom } from './blank-navigation';
import { MathBlank } from './math-blank';
import { useQuestionState } from './question-state';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
export const blankBadge = (index: number) => CIRCLED[index] ?? String(index + 1);

/** Width that fits the expected answer and grows with what is typed. */
export function blankWidth(answer: string, value: string) {
  const length = Math.max([...answer].length, [...value].length, 3);
  return `${Math.min(length + 2.5, 28)}ch`;
}

export type BlankFieldProps = {
  answer: string;
  index: number;
  kind: BlankKind;
  placeholder?: string;
};

/**
 * One blank of a `blank` question: a text input, or for maths a field that
 * opens the on-screen maths keypad instead of the system keyboard.
 */
export function BlankField({ answer, index, kind, placeholder }: BlankFieldProps) {
  const question = useQuestionState();
  const spec = question?.spec.kind === 'blank' ? question.spec : null;
  const label = `第 ${index + 1} 空`;

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || !question) return;
    event.preventDefault();
    advanceFrom(event.currentTarget, question);
  }, [question]);

  if (!question || !spec) {
    return <span data-question-blank="" data-kind={kind} aria-label={label} style={{ width: blankWidth(answer, '') }}>{' '}</span>;
  }

  const value = question.values[index] ?? '';
  const verdict: BlankVerdict | 'idle' = question.evaluation?.blanks[index] ?? 'idle';
  const several = spec.blanks.length > 1;
  const last = index === spec.blanks.length - 1;
  const common = {
    value,
    disabled: question.submitted || !question.ready,
    'aria-label': several ? label : '答案',
    'aria-invalid': verdict === 'incorrect' || verdict === 'invalid' || undefined,
    placeholder,
    'data-feedback': verdict,
    'data-fresh': question.fresh ? '' : undefined,
    'data-manual': question.evaluation?.manual?.[index] ? '' : undefined,
    style: { width: blankWidth(answer, value) },
  } as const;

  return (
    <span className="inline whitespace-nowrap">
      {several ? <span data-blank-index="" aria-hidden="true">{index + 1}</span> : null}
      {kind === 'math' ? (
        <MathBlank {...common} question={question} index={index} count={spec.blanks.length} label={label} last={last} />
      ) : (
        <input
          {...common}
          type="text"
          inputMode="text"
          enterKeyHint={last ? 'done' : 'next'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8192}
          data-question-blank=""
          data-kind="text"
          onChange={(event) => question.setValue(index, event.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
    </span>
  );
}
