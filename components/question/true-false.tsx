'use client';

import type { KeyboardEvent } from 'react';
import { BOOLEAN_FALSE, BOOLEAN_TRUE, booleanLetter } from './grading';
import { useQuestionState } from './question-state';

type Feedback = 'idle' | 'correct' | 'incorrect' | 'answer' | 'dimmed';

const CHOICES = [
  { value: true, letter: BOOLEAN_TRUE, label: '正确', icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  { value: false, letter: BOOLEAN_FALSE, label: '错误', icon: <><path d="M7 7l10 10" /><path d="M17 7L7 17" /></> },
] as const;

export function getBooleanFeedback(letter: string, picked: string | undefined, key: string | null, submitted: boolean): Feedback {
  if (!key || !submitted) return 'idle';
  if (letter === picked) return letter === key ? 'correct' : 'incorrect';
  return letter === key ? 'answer' : 'dimmed';
}

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index === -1) return;
  event.preventDefault();
  buttons[(index + 1) % buttons.length]?.focus();
}

/**
 * A true / false question: two large buttons, graded on click. Picking the
 * wrong one marks it red and outlines the right one in green.
 */
export function TrueFalse() {
  const question = useQuestionState();
  const spec = question?.spec.kind === 'boolean' ? question.spec : null;
  const key = spec ? booleanLetter(spec.answer) : null;
  const picked = question?.selected[0];
  const submitted = question?.submitted ?? false;
  const locked = !question || !spec || submitted || !question.ready;

  return (
    <div role="radiogroup" aria-label="判断" data-exam-boolean="" onKeyDown={moveFocus}>
      {CHOICES.map((choice, index) => {
        const feedback = getBooleanFeedback(choice.letter, picked, key, submitted);
        return (
          <button
            key={choice.letter}
            type="button"
            role="radio"
            aria-checked={picked === choice.letter}
            aria-disabled={locked || undefined}
            tabIndex={(picked ? picked === choice.letter : index === 0) ? 0 : -1}
            data-boolean-option=""
            data-value={String(choice.value)}
            data-feedback={feedback}
            data-fresh={question?.fresh ? '' : undefined}
            onClick={() => { if (!locked) question.select([choice.letter]); }}
          >
            {/* The option's own mark; after grading, a tick or a cross for the reader's pick. */}
            <span data-boolean-glyph="" aria-hidden="true">
              <svg viewBox="0 0 24 24" data-boolean-icon="value">{choice.icon}</svg>
              <svg viewBox="0 0 24 24" data-boolean-icon="correct"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <svg viewBox="0 0 24 24" data-boolean-icon="incorrect"><path d="M7 7l10 10" /><path d="M17 7L7 17" /></svg>
            </span>
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
