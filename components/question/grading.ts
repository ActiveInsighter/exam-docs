/*
 * Pure grading helpers shared by the question components and their tests.
 * Nothing here touches React, so it also runs in the server render.
 */

export type QuestionType = 'single' | 'multiple' | 'boolean' | 'blank' | 'essay';

export const QUESTION_TYPES: readonly QuestionType[] = [
  'single',
  'multiple',
  'boolean',
  'blank',
  'essay',
];

export type AttemptResult = 'correct' | 'partial' | 'incorrect';

export type BlankSpec = {
  answer: string;
  aliases: readonly string[];
  tolerance?: number;
};

export function getOptionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

/** Grades a set of selected option letters against the answer key. */
export function gradeChoice(
  selected: readonly string[],
  key: readonly string[],
): AttemptResult {
  const chosen = new Set(selected);
  const hits = key.filter((letter) => chosen.has(letter)).length;
  if (hits === key.length && chosen.size === key.length) return 'correct';
  if (hits === chosen.size && hits > 0) return 'partial';
  return 'incorrect';
}

/**
 * Light normalisation so that "Ｏ(n)", " o(n) " and "O(n)。" compare equal:
 * NFKC folds full-width forms, whitespace and trailing full stops are dropped
 * and case is ignored. It deliberately does not try to understand maths.
 */
export function normalizeBlankText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[。.]+$/u, '');
}

/** Reads "3", "-0.5", "1/2" or "50%" as a number; anything else is null. */
export function parseBlankNumber(value: string): number | null {
  const text = normalizeBlankText(value).replace(/,/gu, '');
  const fraction = /^([+-]?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/u.exec(text);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const percent = /^([+-]?\d+(?:\.\d+)?)%$/u.exec(text);
  if (percent) return Number(percent[1]) / 100;
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(text) ? Number(text) : null;
}

export function isBlankCorrect(input: string, spec: BlankSpec) {
  const normalized = normalizeBlankText(input);
  if (normalized === '') return false;

  const accepted = [spec.answer, ...spec.aliases];
  if (accepted.some((candidate) => normalizeBlankText(candidate) === normalized)) {
    return true;
  }

  if (spec.tolerance === undefined) return false;
  const value = parseBlankNumber(input);
  if (value === null) return false;
  return accepted.some((candidate) => {
    const target = parseBlankNumber(candidate);
    return target !== null && Math.abs(value - target) <= spec.tolerance!;
  });
}

export function gradeBlanks(
  values: readonly string[],
  specs: readonly BlankSpec[],
): { result: AttemptResult; correct: readonly boolean[] } {
  const correct = specs.map((spec, index) => isBlankCorrect(values[index] ?? '', spec));
  const hits = correct.filter(Boolean).length;
  const result: AttemptResult =
    hits === specs.length ? 'correct' : hits > 0 ? 'partial' : 'incorrect';
  return { result, correct };
}
