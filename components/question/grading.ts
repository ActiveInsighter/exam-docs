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

/**
 * The graded part of a question, derived from its props at render time.
 * `self`: an essay, which the reader grades against the reference solution.
 */
export type GradingSpec =
  | { kind: 'choice'; multiple: boolean; key: readonly string[] }
  | { kind: 'boolean'; answer: boolean }
  | { kind: 'blank'; blanks: readonly BlankSpec[] }
  | { kind: 'self' };

/*
 * Boolean answers are stored as the letters they used when they were drawn
 * as two options, so saved and synced records keep their meaning.
 */
export const BOOLEAN_TRUE = 'A';
export const BOOLEAN_FALSE = 'B';
export const booleanLetter = (value: boolean) => (value ? BOOLEAN_TRUE : BOOLEAN_FALSE);

/*
 * An essay's self-grade is stored as a letter too (like a boolean answer), so
 * saved and synced records keep the same shape as every other question.
 */
export const SELF_GRADES: readonly { letter: string; result: AttemptResult; label: string }[] = [
  { letter: 'A', result: 'correct', label: '正确' },
  { letter: 'B', result: 'partial', label: '部分正确' },
  { letter: 'C', result: 'incorrect', label: '错误' },
];

export const selfGradeOf = (letter: string | undefined) => SELF_GRADES.find((grade) => grade.letter === letter);

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
  return { result: resultOf(verdicts), verdicts, correct };
}

/** True once the reader has entered or picked anything. */
export function isAnswered(spec: GradingSpec, selected: readonly string[], values: readonly string[]) {
  return spec.kind === 'blank'
    ? values.some((value) => value.trim() !== '')
    : selected.length > 0;
}

export type Evaluation = {
  result: AttemptResult;
  /** Per blank, for blank questions: the reader's own grade where given, else the automatic one. */
  blanks: readonly BlankVerdict[];
  /** Per blank, true where the reader overrode the automatic grade. */
  manual?: readonly boolean[];
};

/*
 * Manual grading of blanks. After submitting, the reader may mark a blank
 * right or wrong themselves (an equivalent form the checker cannot prove, a
 * text answer worded differently). A blank question has no options, so its
 * `selected` list carries these grades, one token per overridden blank; the
 * stored and synced record keeps its usual shape.
 */
export type BlankGrade = 'correct' | 'incorrect';

const BLANK_GRADE = /^blank:(\d{1,2}):(correct|incorrect)$/u;

export const blankGradeToken = (index: number, grade: BlankGrade) => `blank:${index}:${grade}`;

/** The reader's grade for each blank, if any, from a blank question's `selected`. */
export function readBlankGrades(selected: readonly string[], count: number): (BlankGrade | undefined)[] {
  const grades: (BlankGrade | undefined)[] = Array.from({ length: count }, () => undefined);
  for (const token of selected) {
    const match = BLANK_GRADE.exec(token);
    if (!match) continue;
    const index = Number(match[1]);
    if (index < count) grades[index] = match[2] as BlankGrade;
  }
  return grades;
}

/** `selected` with blank `index` graded `grade`, or back to the automatic grade with null. */
export function withBlankGrade(selected: readonly string[], index: number, grade: BlankGrade | null): string[] {
  const others = selected.filter((token) => !token.startsWith(`blank:${index}:`));
  return grade ? [...others, blankGradeToken(index, grade)].sort() : others;
}

function resultOf(verdicts: readonly BlankVerdict[]): AttemptResult {
  const hits = verdicts.filter((verdict) => verdict === 'correct').length;
  return hits === verdicts.length ? 'correct' : hits > 0 ? 'partial' : 'incorrect';
}

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
      const grades = readBlankGrades(selected, spec.blanks.length);
      if (!grades.some(Boolean)) return { result: graded.result, blanks: graded.verdicts };
      const blanks = graded.verdicts.map((verdict, index) => grades[index] ?? verdict);
      const manual = grades.map((grade, index) => grade !== undefined && grade !== graded.verdicts[index]);
      return { result: resultOf(blanks), blanks, manual };
    }
    case 'self':
      return { result: selfGradeOf(selected[0])?.result ?? 'incorrect', blanks: [] };
  }
}

/** Short answer text for footers and summaries. */
export function formatKey(spec: GradingSpec): string {
  switch (spec.kind) {
    case 'choice': return spec.key.join('');
    case 'boolean': return spec.answer ? '正确' : '错误';
    case 'blank': return spec.blanks.map((blank) => blank.answer).join('；');
    case 'self': return '见参考解答';
  }
}

/** The reader's answer in the same notation as formatKey. */
export function formatResponse(spec: GradingSpec, selected: readonly string[], values: readonly string[]): string {
  switch (spec.kind) {
    case 'choice': return [...selected].sort().join('') || '—';
    case 'boolean': return selected[0] === BOOLEAN_TRUE ? '正确' : selected[0] === BOOLEAN_FALSE ? '错误' : '—';
    case 'blank': return spec.blanks.map((_, index) => values[index]?.trim() || '—').join('；');
    case 'self': return selfGradeOf(selected[0])?.label ?? '—';
  }
}
