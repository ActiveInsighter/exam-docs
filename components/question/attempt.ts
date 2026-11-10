import { emptyAnswer, type AnswerState } from '@/lib/question-store/types';
import {
  BLANK_SELF_TOKEN,
  type BlankGrade,
  type AttemptResult,
  type Evaluation,
  type GradingSpec,
  gradeBlank,
  isAnswered,
  readBlankGrades,
  withBlankGrade,
} from './grading';

/*
 * The rules of answering a question, as pure functions of its grading spec
 * and the stored answer. Each returns the next answer with how it is to be
 * written, or null when the move is not allowed in that state; the provider
 * (question-state.tsx) only applies the result. No React and no storage, so
 * every rule is unit-tested (tests/question-attempt.test.ts).
 *
 *   draft     kept on this device (picking, typing)
 *   submit    committed with an attempt record
 *   regrade   committed, the same attempt (the reader overrode a blank)
 *   reset     committed, cleared for another go
 */

export type Transition = { state: AnswerState; kind: 'draft' | 'submit' | 'reset' | 'regrade' } | null;

/** Coarse state of a question, published on its footer for page-level navigators. */
export type AttemptStatus = 'idle' | 'draft' | AttemptResult;

export function attemptStatus(spec: GradingSpec, state: AnswerState, evaluation: Evaluation | null): AttemptStatus {
  if (evaluation) return evaluation.result;
  return isAnswered(spec, state.selected, state.values) ? 'draft' : 'idle';
}

/**
 * Graded the moment an answer is picked: an essay's self-grade always, a
 * single answer unless its batch grades everything together (`deferred`).
 */
export function gradesOnPick(spec: GradingSpec, deferred: boolean) {
  return spec.kind === 'self' || (!deferred && (spec.kind === 'boolean' || (spec.kind === 'choice' && !spec.multiple)));
}

const draft = (state: AnswerState, patch: Partial<AnswerState>): Transition => ({ state: { ...state, ...patch }, kind: 'draft' });

const commit = (state: AnswerState, patch: Partial<AnswerState> = {}): Transition =>
  ({ state: { ...state, ...patch, submitted: true, attempt: state.attempt + 1 }, kind: 'submit' });

/** Replaces the picked letters. A changed self-grade is a new attempt, so it replays and syncs like a resubmission. */
export function pick(spec: GradingSpec, state: AnswerState, letters: readonly string[], deferred: boolean): Transition {
  if (spec.kind === 'blank' || (state.submitted && spec.kind !== 'self')) return null;
  const selected = [...letters];
  if (state.submitted && selected.join() === state.selected.join()) return null;
  return gradesOnPick(spec, deferred) && selected.length > 0 ? commit(state, { selected }) : draft(state, { selected });
}

export function fill(spec: GradingSpec, state: AnswerState, index: number, value: string): Transition {
  if (spec.kind !== 'blank' || state.submitted) return null;
  const values = Array.from({ length: Math.max(index + 1, state.values.length) }, (_, position) => state.values[position] ?? '');
  values[index] = value;
  return draft(state, { values });
}

export function submit(spec: GradingSpec, state: AnswerState): Transition {
  return state.submitted || !isAnswered(spec, state.selected, state.values) ? null : commit(state);
}

/** After submitting: the reader's own grade for one blank, or null for the checker's. */
export function regradeBlank(spec: GradingSpec, state: AnswerState, index: number, grade: BlankGrade | null): Transition {
  if (spec.kind !== 'blank' || !state.submitted || !spec.blanks[index]) return null;
  // Agreeing with the checker is no override at all, so "已改判" only marks real changes.
  const auto: BlankGrade = gradeBlank(state.values[index] ?? '', spec.blanks[index]) === 'correct' ? 'correct' : 'incorrect';
  const selected = withBlankGrade(state.selected, index, grade === auto ? null : grade);
  return selected.join() === state.selected.join() ? null : { state: { ...state, selected }, kind: 'regrade' };
}

/**
 * Before submitting (对答案自评): grades blanks against the key. Once every
 * blank has a grade the question is submitted with them, typed or not.
 */
export function selfGradeBlanks(spec: GradingSpec, state: AnswerState, grades: ReadonlyMap<number, BlankGrade>): Transition {
  if (spec.kind !== 'blank' || state.submitted) return null;
  let selected = state.selected.filter((token) => token !== BLANK_SELF_TOKEN);
  for (const [index, grade] of grades) {
    if (spec.blanks[index]) selected = withBlankGrade(selected, index, grade);
  }
  const complete = readBlankGrades(selected, spec.blanks.length).every(Boolean);
  return complete ? commit(state, { selected: [...selected, BLANK_SELF_TOKEN].sort() }) : draft(state, { selected });
}

/** Clears the answer for another go; the attempt count carries on. */
export function reset(state: AnswerState): Transition {
  return { state: { ...emptyAnswer(), attempt: state.attempt }, kind: 'reset' };
}
