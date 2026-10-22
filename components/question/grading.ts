import { compareMath, normalizeMathText, parseMath } from '@/lib/math-expression';

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

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  blank: '填空题',
  essay: '解答题',
};

/**
 * correct: exactly right · partial: only part of the key (少选) ·
 * incorrect: anything wrong was chosen or entered.
 */
export type AttemptResult = 'correct' | 'partial' | 'incorrect';

/** text: normal keyboard, normalised text match · math: maths keypad, equivalent expressions. */
export type BlankKind = 'text' | 'math';

export type BlankSpec = {
  answer: string;
  aliases: readonly string[];
  tolerance?: number;
  kind: BlankKind;
};

/** The graded part of a question, derived from its props at render time. */
export type GradingSpec =
  | { kind: 'choice'; multiple: boolean; key: readonly string[] }
  | { kind: 'boolean'; answer: boolean }
  | { kind: 'blank'; blanks: readonly BlankSpec[] };

/*
 * Boolean answers are stored as the letters they used when they were drawn
 * as two options, so saved and synced records keep their meaning.
 */
export const BOOLEAN_TRUE = 'A';
export const BOOLEAN_FALSE = 'B';
export const booleanLetter = (value: boolean) => (value ? BOOLEAN_TRUE : BOOLEAN_FALSE);

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
 * and case is ignored.
 */
export function normalizeBlankText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[“”"'‘’「」『』]/gu, '')
    .replace(/[。.;；,，、]+$/u, '');
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

/**
 * Answers made only of digits and arithmetic ("3", "-1/2", "2√3", "50%") get
 * the maths keypad unless the author chose a kind.
 */
export function inferBlankKind(answer: string): BlankKind {
  const text = normalizeMathText(answer).replace(/sqrt|cbrt|pi/gu, '');
  return text !== '' && /^[\d\s.+\-*/^()%!]+$/u.test(text) && parseMath(answer).ok ? 'math' : 'text';
}

export type BlankVerdict = 'correct' | 'incorrect' | 'empty' | 'invalid';

/** One blank: maths blanks compare by value, text blanks by normalised spelling. */
export function gradeBlank(input: string, spec: BlankSpec): BlankVerdict {
  const normalized = normalizeBlankText(input);
  if (normalized === '') return 'empty';

  const accepted = [spec.answer, ...spec.aliases];
  if (accepted.some((candidate) => normalizeBlankText(candidate) === normalized)) return 'correct';

  if (spec.kind === 'math') {
    let invalid = false;
    for (const candidate of accepted) {
      const comparison = compareMath(input, candidate, { tolerance: spec.tolerance });
      if (comparison.status === 'equal') return 'correct';
      if (comparison.status === 'invalid' && !comparison.error.startsWith('参考答案')) invalid = true;
    }
    return invalid ? 'invalid' : 'incorrect';
  }

  if (spec.tolerance === undefined) return 'incorrect';
  const value = parseBlankNumber(input);
  if (value === null) return 'incorrect';
  return accepted.some((candidate) => {
    const target = parseBlankNumber(candidate);
    return target !== null && Math.abs(value - target) <= spec.tolerance!;
  }) ? 'correct' : 'incorrect';
}

export function isBlankCorrect(input: string, spec: BlankSpec) {
  return gradeBlank(input, spec) === 'correct';
}

export function gradeBlanks(
  values: readonly string[],
  specs: readonly BlankSpec[],
): { result: AttemptResult; verdicts: readonly BlankVerdict[]; correct: readonly boolean[] } {
  const verdicts = specs.map((spec, index) => gradeBlank(values[index] ?? '', spec));
  const correct = verdicts.map((verdict) => verdict === 'correct');
  const hits = correct.filter(Boolean).length;
  const result: AttemptResult =
    hits === specs.length ? 'correct' : hits > 0 ? 'partial' : 'incorrect';
  return { result, verdicts, correct };
}

/** True once the reader has entered or picked anything. */
export function isAnswered(spec: GradingSpec, selected: readonly string[], values: readonly string[]) {
  return spec.kind === 'blank'
    ? values.some((value) => value.trim() !== '')
    : selected.length > 0;
}

export type Evaluation = {
  result: AttemptResult;
  /** Per blank, for blank questions. */
  blanks: readonly BlankVerdict[];
};

export function evaluateAttempt(
  spec: GradingSpec,
  selected: readonly string[],
  values: readonly string[],
): Evaluation {
  switch (spec.kind) {
    case 'choice':
      return { result: gradeChoice(selected, spec.key), blanks: [] };
    case 'boolean':
      return { result: gradeChoice(selected, [booleanLetter(spec.answer)]), blanks: [] };
    case 'blank': {
      const graded = gradeBlanks(values, spec.blanks);
      return { result: graded.result, blanks: graded.verdicts };
    }
  }
}

/** Short answer text for footers and summaries. */
export function formatKey(spec: GradingSpec): string {
  switch (spec.kind) {
    case 'choice': return spec.key.join('');
    case 'boolean': return spec.answer ? '正确' : '错误';
    case 'blank': return spec.blanks.map((blank) => blank.answer).join('；');
  }
}

/** The reader's answer in the same notation as formatKey. */
export function formatResponse(spec: GradingSpec, selected: readonly string[], values: readonly string[]): string {
  switch (spec.kind) {
    case 'choice': return [...selected].sort().join('') || '—';
    case 'boolean': return selected[0] === BOOLEAN_TRUE ? '正确' : selected[0] === BOOLEAN_FALSE ? '错误' : '—';
    case 'blank': return spec.blanks.map((_, index) => values[index]?.trim() || '—').join('；');
  }
}
