import type { QuestionState } from './question-state';

/** Enter (or the keypad's confirm key) moves to the next blank, and submits from the last (not in a batch graded together). */
function blanksAround(input: HTMLElement) {
  return Array.from(input.closest('[data-exam-question]')?.querySelectorAll<HTMLInputElement>('input[data-question-blank]') ?? []);
}

export function advanceFrom(input: HTMLElement, question: QuestionState) {
  const blanks = blanksAround(input);
  const next = blanks[blanks.indexOf(input as HTMLInputElement) + 1];
  if (next && !next.disabled) next.focus();
  else {
    input.blur();
    if (!question.deferred) question.submit();
  }
}

/** The maths keypad's previous / next keys: focus a neighbouring blank, if there is one. */
export function stepFrom(input: HTMLElement, delta: -1 | 1) {
  const blanks = blanksAround(input);
  const target = blanks[blanks.indexOf(input as HTMLInputElement) + delta];
  if (target && !target.disabled) target.focus();
}
