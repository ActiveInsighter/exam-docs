import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExamQuestion, ExamSolution, ExamAnswer, ExamExplanation } from '@/components/exam-question';
import { ExamArticle, EnglishReading } from '@/components/english-reading';
import { ExamKeySentence } from '@/components/english-reading/key-sentence';
import { splitReadingContent } from '@/components/english-reading/parts';
import { initialReadingState, readingReducer } from '@/components/english-reading/model';

const article = createElement(ExamArticle, { title: 'A familiar park', children:
  createElement('p', null, 'Notice ', createElement(ExamKeySentence, { id: 'attention', children: 'the details nearby.' })) });
const question = createElement(ExamQuestion, { children: [
  createElement('p', { key: 'prompt' }, 'Why pay attention?'),
  createElement(ExamSolution, { key: 'solution', evidence: ['attention'], children: [
    createElement(ExamAnswer, { key: 'answer' }, 'B'),
    createElement(ExamExplanation, { key: 'explanation' }, 'Observe the familiar surroundings.'),
  ] }),
] });

describe('reading authoring boundary', () => {
  it('extracts existing question slots into explicit presentation data', () => {
    const parts = splitReadingContent([article, question]);
    expect(parts.article).toMatchObject({ type: ExamArticle, props: article.props });
    expect(parts.questions).toHaveLength(1);
    expect(parts.questions[0]).toMatchObject({ answer: 'B', explanation: 'Observe the familiar surroundings.', evidence: ['attention'] });
    expect(renderToStaticMarkup(parts.questions[0].prompt)).toContain('Why pay attention?');
    expect(EnglishReading({ children: [article, question] }).props.questions).toHaveLength(1);
  });
  it('accepts fragments and solutions without evidence or a short answer', () => {
    const legacy = createElement(ExamQuestion, { children: [createElement('p', { key: 'q' }, 'Question'), createElement(ExamSolution, { key: 's' }, 'Full explanation')] });
    expect(splitReadingContent(createElement(Fragment, null, article, legacy)).questions[0]).toMatchObject({ answer: null, evidence: [], explanation: 'Full explanation' });
  });
  it('rejects missing, duplicate or ambiguous content before publication', () => {
    const missing = createElement(ExamQuestion, { children: createElement(ExamSolution, { evidence: ['missing'], children: 'Explanation' }) });
    expect(() => splitReadingContent([article, missing])).toThrow(/missing/i);
    expect(() => splitReadingContent([question])).toThrow(/article/i);
    expect(() => splitReadingContent([article, article, question])).toThrow(/article/i);
    expect(() => splitReadingContent([article])).toThrow(/question/i);
    expect(() => splitReadingContent([article, createElement(ExamQuestion, null, 'No solution')])).toThrow(/solution/i);
    expect(() => splitReadingContent([article, createElement(ExamQuestion, null, createElement(ExamSolution, null, 'One'), createElement(ExamSolution, null, 'Two'))])).toThrow(/solution/i);
    const duplicate = createElement(ExamArticle, { title: 'Duplicate', children: [
      createElement(ExamKeySentence, { id: 'same', key: 'a', children: 'One.' }),
      createElement(ExamKeySentence, { id: 'same', key: 'b', children: 'Two.' }),
    ] });
    expect(() => splitReadingContent([duplicate, question])).toThrow(/duplicate/i);
  });
  it('keeps normal question presentation independent of the reading workspace', () => {
    const html = renderToStaticMarkup(question);
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('Observe the familiar');
  });
  it('server-renders readable content and current question without portals', () => {
    const html = renderToStaticMarkup(createElement(EnglishReading, null, article, question));
    expect(html).toContain('data-reading-workspace');
    expect(html).toContain('the details nearby.');
    expect(html).toContain('Why pay attention?');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('Observe the familiar');
  });
});

describe('reading workspace transitions', () => {
  it('opens one solution without switching away from questions', () => {
    const state = readingReducer(initialReadingState, { type: 'view', view: 'questions' });
    const opened = readingReducer(state, { type: 'solution', evidence: ['a', 'b'] });
    expect(opened).toMatchObject({ question: 0, revealed: true, view: 'questions', evidence: 'a' });
    expect(readingReducer(opened, { type: 'solution', evidence: ['a', 'b'] })).toMatchObject({ revealed: false, evidence: null });
  });
  it('locates the requested evidence and returns without resetting the solution', () => {
    const opened = readingReducer(initialReadingState, { type: 'solution', evidence: ['a', 'b'] });
    const evidence = readingReducer(opened, { type: 'evidence', id: 'b' });
    expect(evidence).toMatchObject({ revealed: true, view: 'article', evidence: 'b' });
    expect(readingReducer(evidence, { type: 'view', view: 'questions' })).toEqual({ ...evidence, view: 'questions' });
    expect(readingReducer(evidence, { type: 'evidence', id: 'b' }).revision).toBeGreaterThan(evidence.revision);
  });
  it('switches questions atomically and rejects navigation beyond either end', () => {
    const opened = readingReducer(initialReadingState, { type: 'solution', evidence: ['a'] });
    expect(readingReducer(opened, { type: 'question', index: -1, count: 5 })).toBe(opened);
    expect(readingReducer(opened, { type: 'question', index: 5, count: 5 })).toBe(opened);
    expect(readingReducer(opened, { type: 'question', index: 0.5, count: 5 })).toBe(opened);
    expect(readingReducer(opened, { type: 'question', index: 0, count: 5 })).toBe(opened);
    expect(readingReducer(opened, { type: 'question', index: 1, count: 5 })).toMatchObject({ question: 1, revealed: false, evidence: null, view: 'questions' });
  });
  it('supports explanatory solutions without evidence', () => {
    expect(readingReducer(initialReadingState, { type: 'solution', evidence: [] })).toMatchObject({ revealed: true, evidence: null });
  });
});
