import { describe, expect, it } from 'vitest';
import { initialReadingState, readingReducer, validateExercise } from '@/components/english-reading/model';
import { attentionExercise } from '@/content/exercises/attention';
import { EnglishReadingPractice } from '@/components/english-reading-practice';
import { highlightFrame, mergeLineRects } from '@/components/reading-motion/geometry';

describe('English reading practice', () => {
  it('resolves a named exercise without an import inside Dynamic MDX', () => {
    expect(EnglishReadingPractice({ exerciseId: 'attention-01' }).props.exercise).toBe(attentionExercise);
    expect(EnglishReadingPractice({ exercise: attentionExercise }).props.exercise).toBe(attentionExercise);
    // Runtime MDX authoring does not have TypeScript's prop validation.
    // @ts-expect-error deliberately invalid authoring data
    expect(() => EnglishReadingPractice({ exerciseId: 'missing' })).toThrow(/Unknown/);
  });
  it('starts without answers or evidence and records an independent choice for each question', () => {
    const first = readingReducer(initialReadingState, { type: 'choose', questionId: 'q1', optionId: 'B' });
    const second = readingReducer(first, { type: 'choose', questionId: 'q2', optionId: 'A' });
    expect(second.choices).toEqual({ q1: 'B', q2: 'A' });
    expect(second.revealed).toEqual({});
    expect(second.activeQuestionId).toBeNull();
  });

  it('reveals an answer without activating evidence, and locks only that answered question', () => {
    const revealed = readingReducer(initialReadingState, { type: 'answer', questionId: 'q1' });
    expect(revealed.revealed.q1).toBe(true);
    expect(revealed.activeQuestionId).toBeNull();
    expect(readingReducer(revealed, { type: 'choose', questionId: 'q1', optionId: 'D' })).toBe(revealed);
    expect(readingReducer(revealed, { type: 'choose', questionId: 'q2', optionId: 'C' }).choices.q2).toBe('C');
  });

  it('switches evidence to the newly opened explanation and rejects a stale animation completion', () => {
    const first = readingReducer(initialReadingState, { type: 'explanation', questionId: 'q1' });
    const second = readingReducer(first, { type: 'explanation', questionId: 'q5' });
    expect(second.activeQuestionId).toBe('q5');
    expect(second.evidenceIndex).toBe(0);
    expect(second.revealed).toEqual({ q1: true, q5: true });
    const stale = readingReducer(second, { type: 'evidence-complete', questionId: 'q1', replay: first.replay, index: 0, count: 2 });
    expect(stale).toBe(second);
    const next = readingReducer(second, { type: 'evidence-complete', questionId: 'q5', replay: second.replay, index: 0, count: 2 });
    expect(next.evidenceIndex).toBe(1);
    expect(readingReducer(next, { type: 'evidence-complete', questionId: 'q5', replay: next.replay, index: 1, count: 2 }).evidenceIndex).toBe(2);
  });

  it('replays from the first sentence, closes the active explanation, and resets all practice state', () => {
    const opened = readingReducer(initialReadingState, { type: 'explanation', questionId: 'q5' });
    const replayed = readingReducer({ ...opened, evidenceIndex: 2 }, { type: 'replay' });
    expect(replayed.evidenceIndex).toBe(0);
    expect(replayed.replay).toBeGreaterThan(opened.replay);
    expect(readingReducer(replayed, { type: 'explanation', questionId: 'q5' }).activeQuestionId).toBeNull();
    expect(readingReducer(replayed, { type: 'reset' })).toEqual(initialReadingState);
  });

  it('validates demo answers and every evidence reference before rendering', () => {
    expect(() => validateExercise(attentionExercise)).not.toThrow();
    expect(() => validateExercise({ ...attentionExercise, questions: [{ ...attentionExercise.questions[0], evidence: ['missing'] }] })).toThrow(/evidence/i);
    expect(() => validateExercise({ ...attentionExercise, questions: [{ ...attentionExercise.questions[0], answer: 'Z' }] })).toThrow(/answer/i);
    expect(() => validateExercise({ ...attentionExercise, paragraphs: [attentionExercise.paragraphs[0], attentionExercise.paragraphs[0]] })).toThrow(/duplicate/i);
  });
});

describe('wrapped sentence selection geometry', () => {
  const lines = [{ x: 0, y: 0, width: 100, height: 20 }, { x: -30, y: 28, width: 60, height: 20 }];
  it('fills actual wrapped lines in reading order and hides the cursor after completion', () => {
    expect(highlightFrame(lines, 0).fills).toEqual([0, 0]);
    expect(highlightFrame(lines, 0.5).fills[0]).toBeGreaterThan(0.8);
    expect(highlightFrame(lines, 0.5).fills[1]).toBe(0);
    expect(highlightFrame(lines, 1).fills).toEqual([1, 1]);
    expect(highlightFrame(lines, 1).opacity).toBe(0);
    expect(highlightFrame([], 0.5).opacity).toBe(0);
  });
  it('merges rich inline runs while preserving the next line and mixed font heights', () => {
    expect(mergeLineRects([{ x: 0, y: 0, width: 35, height: 20 }, { x: 35, y: 5, width: 30, height: 20 }, lines[1]])).toEqual([
      { x: 0, y: 0, width: 65, height: 25 }, lines[1],
    ]);
  });
});
