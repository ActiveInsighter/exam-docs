import type { QuestionState } from './question-state';

/** Enter (or the keypad's confirm key) moves to the next blank, and submits from the last (not in a batch graded together). */
export function advanceFrom(input: HTMLElement, question: QuestionState) {
  const blanks = Array.from(input.closest('[data-exam-question]')?.querySelectorAll<HTMLInputElement>('input[data-question-blank]') ?? []);
  const next = blanks[blanks.indexOf(input as HTMLInputElement) + 1];
  if (next && !next.disabled) next.focus();
  else {
    input.blur();
    if (!question.deferred) question.submit();
  }
}
