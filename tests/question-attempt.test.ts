import { describe, expect, it } from 'vitest';
import { attemptStatus, fill, pick, regradeBlank, reset, selfGradeBlanks, submit } from '@/components/question/attempt';
import { evaluateAttempt, optionFeedback, readBlankGrades, type GradingSpec } from '@/components/question/grading';
import { emptyAnswer } from '@/lib/question-store/types';

const single: GradingSpec = { kind: 'choice', multiple: false, key: ['C'] };
const multiple: GradingSpec = { kind: 'choice', multiple: true, key: ['A', 'C'] };
const blanks: GradingSpec = {
  kind: 'blank',
  blanks: [{ answer: '传输层', aliases: [], kind: 'text' }, { answer: '3', aliases: [], kind: 'math' }],
};

describe('question attempts', () => {
  it('grades a single pick immediately and locks it until reset', () => {
    const initial = emptyAnswer();
    const next = pick(single, initial, ['C'], false)!;
    expect(next.kind).toBe('submit');
    expect(next.state).toEqual({ selected: ['C'], values: [], submitted: true, attempt: 1 });
    expect(initial).toEqual(emptyAnswer());
    expect(pick(single, next.state, ['A'], false)).toBeNull();
    expect(submit(single, next.state)).toBeNull();
  });

  it('keeps multiple and deferred single picks as drafts until submission', () => {
    for (const spec of [single, multiple]) {
      const draft = pick(spec, emptyAnswer(), ['A'], true)!;
      expect(draft.kind).toBe('draft');
      expect(attemptStatus(spec, draft.state, null)).toBe('draft');
      expect(submit(spec, draft.state)?.state.attempt).toBe(1);
    }
    expect(pick(multiple, emptyAnswer(), ['A'], false)?.kind).toBe('draft');
    expect(submit(single, emptyAnswer())).toBeNull();
    expect(attemptStatus(single, emptyAnswer(), null)).toBe('idle');
  });

  it('records a changed essay grade as a new attempt even in a deferred batch', () => {
    const essay: GradingSpec = { kind: 'self' };
    const first = pick(essay, emptyAnswer(), ['A'], true)!;
    expect(first.kind).toBe('submit');
    expect(pick(essay, first.state, ['A'], true)).toBeNull();
    expect(pick(essay, first.state, ['B'], true)?.state.attempt).toBe(2);
  });

  it('preserves blank positions and locks typing after submission', () => {
    const draft = fill(blanks, emptyAnswer(), 1, '1+2')!;
    expect(draft.state.values).toEqual(['', '1+2']);
    expect(draft.state.attempt).toBe(0);
    const submitted = submit(blanks, draft.state)!;
    expect(fill(blanks, submitted.state, 0, '传输层')).toBeNull();
    expect(fill(single, emptyAnswer(), 0, 'x')).toBeNull();
  });

  it('submits self-graded blanks only after every blank has a grade, without typed answers', () => {
    const first = selfGradeBlanks(blanks, emptyAnswer(), new Map([[0, 'correct']]))!;
    expect(first.kind).toBe('draft');
    expect(readBlankGrades(first.state.selected, 2)).toEqual(['correct', undefined]);
    const final = selfGradeBlanks(blanks, first.state, new Map([[1, 'incorrect']]))!;
    expect(final.kind).toBe('submit');
    expect(final.state.attempt).toBe(1);
    expect(final.state.values).toEqual([]);
    expect(evaluateAttempt(blanks, final.state.selected, final.state.values).result).toBe('partial');
    expect(selfGradeBlanks(blanks, final.state, new Map([[1, 'correct']]))).toBeNull();
  });

  it('can self-grade all blanks at once and ignores indices outside the question', () => {
    const result = selfGradeBlanks(blanks, emptyAnswer(), new Map([[0, 'correct'], [1, 'correct'], [7, 'incorrect']]))!;
    const evaluation = evaluateAttempt(blanks, result.state.selected, result.state.values);
    expect(evaluation.result).toBe('correct');
    expect(attemptStatus(blanks, result.state, evaluation)).toBe('correct');
    expect(readBlankGrades(result.state.selected, 2)).toEqual(['correct', 'correct']);
  });

  it('overrides the checker within the same attempt and removes the override when restored', () => {
    const state = { ...emptyAnswer(), values: ['传输层', '2'], submitted: true, attempt: 3 };
    const corrected = regradeBlank(blanks, state, 1, 'correct')!;
    expect(corrected.kind).toBe('regrade');
    expect(corrected.state.attempt).toBe(3);
    expect(evaluateAttempt(blanks, corrected.state.selected, corrected.state.values).manual).toEqual([false, true]);
    expect(regradeBlank(blanks, corrected.state, 1, 'correct')).toBeNull();
    const restored = regradeBlank(blanks, corrected.state, 1, 'incorrect')!;
    expect(restored.state).toEqual(state);
    expect(regradeBlank(blanks, emptyAnswer(), 0, 'correct')).toBeNull();
    expect(regradeBlank(blanks, state, 7, 'correct')).toBeNull();
  });

  it('keeps the attempt count through reset and increments on the next submission', () => {
    const first = pick(single, emptyAnswer(), ['A'], false)!;
    const cleared = reset(first.state)!;
    expect(cleared.kind).toBe('reset');
    expect(cleared.state).toEqual({ ...emptyAnswer(), attempt: 1 });
    expect(pick(single, cleared.state, ['C'], false)?.state.attempt).toBe(2);
  });
});

describe('shared option feedback', () => {
  it('distinguishes wrong picks, missed answers and uninvolved options', () => {
    const context = { key: ['A', 'C'], selected: ['A', 'B'], submitted: true, multiple: true };
    expect(['A', 'B', 'C', 'D'].map((letter) => optionFeedback(letter, context)))
      .toEqual(['correct', 'incorrect', 'missed', 'dimmed']);
    expect(optionFeedback('C', { ...context, multiple: false })).toBe('answer');
  });

  it('reveals only the key in the solution mirror before submission', () => {
    const context = { key: ['C'], selected: ['A'], submitted: false };
    expect(optionFeedback('A', context)).toBe('selected');
    expect(optionFeedback('C', context)).toBe('idle');
    expect(optionFeedback('A', { ...context, reveal: true })).toBe('idle');
    expect(optionFeedback('C', { ...context, reveal: true })).toBe('answer');
  });
});
