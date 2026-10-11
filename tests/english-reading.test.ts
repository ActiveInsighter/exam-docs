import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExamQuestion, ExamSolution, ExamAnswer, ExamExplanation } from '@/components/exam-question';
import { ExamArticle, EnglishReading } from '@/components/english-reading';
import { ExamKeySentence } from '@/components/english-reading/key-sentence';
import { splitReadingContent } from '@/components/english-reading/parts';
import { readingReducer } from '@/components/english-reading/model';
import { highlightFrame, mergeLineRects } from '@/components/reading-motion/geometry';

const article = createElement(ExamArticle, { title: 'A familiar park', children:
  createElement('p', null, 'Notice ', createElement(ExamKeySentence, { id: 'attention', children: 'the details nearby.' })) });
const question = createElement(ExamQuestion, { children: [
  createElement('p', { key: 'prompt' }, 'Why pay attention?'),
  createElement(ExamSolution, { key: 'solution', evidence: ['attention'], children: [
    createElement(ExamAnswer, { key: 'answer' }, 'B'),
    createElement(ExamExplanation, { key: 'explanation' }, 'Observe the familiar surroundings.'),
  ] }),
] });

describe('reading composition with existing exam components', () => {
  it('separates the article while preserving the existing question and solution slots', () => {
    const parts = splitReadingContent([article, question]);
    expect(parts.article).toMatchObject({ type: ExamArticle, props: article.props });
    expect(parts.questions).toHaveLength(1);
    expect(parts.questions[0]).toMatchObject({ type: ExamQuestion, props: question.props });
    expect(EnglishReading({ children: [article, question] }).props.article).toMatchObject({ type: ExamArticle });
  });
  it('supports fragments and validates missing or duplicate evidence references', () => {
    expect(() => splitReadingContent(createElement(Fragment, null, article, question))).not.toThrow();
    const badQuestion = createElement(ExamQuestion, { children: createElement(ExamSolution, { evidence: ['missing'], children: 'Explanation' }) });
    expect(() => splitReadingContent([article, badQuestion])).toThrow(/missing/i);
    expect(() => splitReadingContent([question])).toThrow(/article/i);
    expect(() => splitReadingContent([article, article, question])).toThrow(/article/i);
    const duplicate = createElement(ExamArticle, { title: 'Duplicate', children: [
      createElement(ExamKeySentence, { id: 'same', key: 'a', children: 'One.' }),
      createElement(ExamKeySentence, { id: 'same', key: 'b', children: 'Two.' }),
    ] });
    expect(() => splitReadingContent([duplicate, question])).toThrow(/duplicate/i);
  });
  it('keeps ordinary ExamQuestion hover previews and dialog presentation outside a reading', () => {
    const html = renderToStaticMarkup(question);
    expect(html).toContain('data-exam-question');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('Observe the familiar');
  });
});

describe('reading evidence state', () => {
  it('advances evidence in order and rejects callbacks from an interrupted question', () => {
    const first = readingReducer(null, { type: 'open', id: 'q1', evidence: ['a', 'b'] });
    const second = readingReducer(first, { type: 'open', id: 'q2', evidence: ['c', 'd'] });
    expect(second?.id).toBe('q2');
    expect(readingReducer(second, { type: 'complete', id: 'q1', replay: first!.replay, index: 0 })).toBe(second);
    const next = readingReducer(second, { type: 'complete', id: 'q2', replay: second!.replay, index: 0 });
    expect(next?.index).toBe(1);
    expect(readingReducer(next, { type: 'complete', id: 'q2', replay: next!.replay, index: 1 })?.index).toBe(2);
  });
  it('replays without accepting old callbacks and only closes the owning solution', () => {
    const opened = readingReducer(null, { type: 'open', id: 'q1', evidence: ['a'] });
    const replayed = readingReducer(opened, { type: 'replay', id: 'q1' });
    expect(replayed?.index).toBe(0);
    expect(replayed!.replay).toBeGreaterThan(opened!.replay);
    expect(readingReducer(replayed, { type: 'complete', id: 'q1', replay: opened!.replay, index: 0 })).toBe(replayed);
    expect(readingReducer(replayed, { type: 'close', id: 'q2' })).toBe(replayed);
    expect(readingReducer(replayed, { type: 'close', id: 'q1' })).toBeNull();
  });
  it('returns from evidence to the same solution without resetting the selection', () => {
    const opened = readingReducer(null, { type: 'open', id: 'q1', evidence: ['a', 'b'] });
    const viewing = readingReducer(opened, { type: 'show-evidence', id: 'q1' });
    expect(viewing?.view).toBe('evidence');
    const completed = readingReducer(viewing, { type: 'complete', id: 'q1', replay: viewing!.replay, index: 0 });
    expect(readingReducer(completed, { type: 'return', id: 'q1' })).toEqual({ ...completed, view: 'solution' });
    expect(readingReducer(completed, { type: 'return', id: 'q2' })).toBe(completed);
  });
  it('starts a new question in solution view and ignores old evidence navigation', () => {
    const first = readingReducer(null, { type: 'open', id: 'q1', evidence: ['a'] });
    const viewing = readingReducer(first, { type: 'show-evidence', id: 'q1' });
    const second = readingReducer(viewing, { type: 'open', id: 'q2', evidence: ['b'] });
    expect(second?.view).toBe('solution');
    expect(readingReducer(second, { type: 'show-evidence', id: 'q1' })).toBe(second);
  });
});

describe('wrapped sentence selection', () => {
  const lines = [{ x: 0, y: 0, width: 100, height: 20 }, { x: -30, y: 28, width: 60, height: 20 }];
  it('fills measured lines in reading order and preserves the completed selection', () => {
    expect(highlightFrame(lines, 0).fills).toEqual([0, 0]);
    expect(highlightFrame(lines, 0.5).fills[0]).toBeGreaterThan(0.8);
    expect(highlightFrame(lines, 0.5).fills[1]).toBe(0);
    expect(highlightFrame(lines, 1).fills).toEqual([1, 1]);
    expect(highlightFrame(lines, 1).opacity).toBe(0);
  });
  it('merges rich inline runs without extending into another line', () => {
    expect(mergeLineRects([{ x: 0, y: 0, width: 35, height: 20 }, { x: 35, y: 5, width: 30, height: 20 }, lines[1]])).toEqual([
      { x: 0, y: 0, width: 65, height: 25 }, lines[1],
    ]);
  });
});
