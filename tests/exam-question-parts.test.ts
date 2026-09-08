import { createElement, isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  ExamAnswer,
  ExamExplanation,
  splitExamSolution,
} from '@/components/exam-question-parts';

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
