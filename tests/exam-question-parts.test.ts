import { createElement, isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  ExamAnswer,
  ExamExplanation,
  splitExamSolution,
  parseAnswerKey,
  splitOptionLabel,
} from '@/components/exam/parts';

describe('splitExamSolution', () => {
  it('separates the short answer from the explanation', () => {
    const explanation = createElement('p', null, '推导过程');

    const parts = splitExamSolution([
      createElement(ExamAnswer, null, 'A'),
      createElement(ExamExplanation, null, explanation),
    ]);

    expect(parts.answer).toBe('A');
    expect(isValidElement(parts.explanation)).toBe(true);
    expect((parts.explanation as { props: { children: string } }).props.children).toBe(
      '推导过程',
    );
  });

  it('keeps legacy unwrapped solution content as explanation', () => {
    const legacyContent = createElement('p', null, '答案：A；解析内容');

    const parts = splitExamSolution(legacyContent);

    expect(parts.answer).toBeNull();
    expect(isValidElement(parts.explanation)).toBe(true);
    expect((parts.explanation as { type: string }).type).toBe('p');
    expect(
      (parts.explanation as { props: { children: string } }).props.children,
    ).toBe('答案：A；解析内容');
  });
});

describe('parseAnswerKey', () => {
  it.each([
    ['A', ['A']],
    ['ACD', ['A', 'C', 'D']],
    ['B。', ['B']],
    ['（A）', ['A']],
    ['B．条件收敛。', ['B']],
    ['C，即 y=2x^2。', ['C']],
    ['A、C', ['A', 'C']],
    ['DB', ['B', 'D']],
  ])('reads option letters from %s', (answer, key) => {
    expect(parseAnswerKey(answer)).toEqual(key);
  });

  it.each(['原选项中无正确项。', '(1) C；(2) D。', '严格地说，选 D', '$ a>0$'])(
    'leaves free-form answer %s ungraded',
    (answer) => {
      expect(parseAnswerKey(answer)).toBeNull();
    },
  );

  it('reads KaTeX answers from the rendered HTML half only', () => {
    const katex = createElement(
      'span',
      { className: 'katex' },
      createElement('span', { className: 'katex-mathml' }, '\\mathrm{B}'),
      createElement('span', { className: 'katex-html' }, 'B'),
    );
    expect(parseAnswerKey(katex)).toEqual(['B']);
  });
});

describe('splitOptionLabel', () => {
  it('moves the authored prefix into the label', () => {
    expect(splitOptionLabel('A. 有且仅有水平渐近线')).toEqual({
      label: 'A',
      content: '有且仅有水平渐近线',
    });
  });

  it('strips the prefix in front of inline math without touching the formula', () => {
    const formula = createElement('span', { className: 'katex' }, 'y=x');
    const { label, content } = splitOptionLabel(['B. ', formula]);

    expect(label).toBe('B');
    expect(content).toEqual(['', formula]);
  });

  it('descends into a paragraph wrapper', () => {
    const { label, content } = splitOptionLabel(createElement('p', null, 'C．第三项'));

    expect(label).toBe('C');
    expect((content as { props: { children: string } }).props.children).toBe('第三项');
  });

  it('keeps options without a prefix intact', () => {
    expect(splitOptionLabel('无前缀')).toEqual({ label: null, content: '无前缀' });
  });
});
