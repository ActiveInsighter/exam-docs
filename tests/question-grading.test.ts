import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  gradeBlanks,
  gradeChoice,
  isBlankCorrect,
  normalizeBlankText,
  parseBlankNumber,
} from '@/components/question/grading';
import { Blank, Option, Solution } from '@/components/question/parts';
import { buildChoiceModel, indexBlanks, splitQuestion } from '@/components/question/model';

describe('gradeChoice', () => {
  it('requires the exact set for a correct multiple-choice answer', () => {
    expect(gradeChoice(['A', 'C'], ['A', 'C'])).toBe('correct');
    expect(gradeChoice(['C', 'A'], ['A', 'C'])).toBe('correct');
  });

  it('reports a subset of the key as partial and anything wrong as incorrect', () => {
    expect(gradeChoice(['A'], ['A', 'C'])).toBe('partial');
    expect(gradeChoice(['A', 'B'], ['A', 'C'])).toBe('incorrect');
    expect(gradeChoice(['B'], ['A'])).toBe('incorrect');
  });
});

describe('blank grading', () => {
  it('ignores case, spacing, full-width forms and a trailing full stop', () => {
    expect(normalizeBlankText(' Ｏ(n) 。')).toBe('o(n)');
    expect(isBlankCorrect('传输 层', { answer: '传输层', aliases: [] })).toBe(true);
  });

  it('accepts aliases', () => {
    const spec = { answer: '0.5', aliases: ['1/2'] };
    expect(isBlankCorrect('1/2', spec)).toBe(true);
    expect(isBlankCorrect('0.25', spec)).toBe(false);
  });

  it('accepts numbers within the tolerance, including fractions and percentages', () => {
    const spec = { answer: '3.14', aliases: [], tolerance: 0.01 };
    expect(isBlankCorrect('3.141', spec)).toBe(true);
    expect(isBlankCorrect('3.2', spec)).toBe(false);
    expect(parseBlankNumber('1/4')).toBe(0.25);
    expect(parseBlankNumber('50%')).toBe(0.5);
    expect(parseBlankNumber('abc')).toBeNull();
    expect(isBlankCorrect('1/2', { answer: '0.5', aliases: [], tolerance: 0 })).toBe(true);
  });

  it('never accepts an empty entry', () => {
    expect(isBlankCorrect('  ', { answer: '', aliases: [] })).toBe(false);
  });

  it('grades several blanks together', () => {
    const specs = [
      { answer: '传输层', aliases: [] },
      { answer: '3', aliases: [] },
    ];
    expect(gradeBlanks(['传输层', '3'], specs).result).toBe('correct');
    expect(gradeBlanks(['传输层', '2'], specs)).toEqual({
      result: 'partial',
      correct: [true, false],
    });
    expect(gradeBlanks(['', ''], specs).result).toBe('incorrect');
  });
});

describe('question model', () => {

  it('separates stem, options and solution, wherever the options are wrapped', () => {
    const split = splitQuestion([
      createElement('p', { key: 'stem' }, '题干'),
      createElement('p', { key: 'run' }, createElement(Option, null, '甲'), '\n', createElement(Option, { correct: true }, '乙')),
      createElement(Solution, { key: 'solution' }, '解析'),
    ]);

    expect(split.options).toHaveLength(2);
    expect(split.stem).toHaveLength(2);
    expect(split.optionSlot).toBe(1);
    expect(split.solution).not.toBeNull();
  });

  it('derives the answer key from the correct flags', () => {
    const { options } = splitQuestion([
      createElement(Option, { key: 'a' }, '甲'),
      createElement(Option, { key: 'b', correct: true }, '乙'),
    ]);
    const model = buildChoiceModel({ type: 'single', options });

    expect(model).toMatchObject({ kind: 'choice', multiple: false, key: ['B'] });
    expect(buildChoiceModel({ type: 'multiple', options })).toEqual({ kind: 'none' });
    expect(buildChoiceModel({ type: 'essay', options })).toEqual({ kind: 'none' });
  });

  it('numbers blanks in document order and collects their answers', () => {
    const { stem, blanks } = indexBlanks([
      createElement('p', { key: 'p' }, '甲', createElement(Blank, { answer: '1' }), '乙', createElement('em', null, createElement(Blank, { answer: 2, aliases: ['二'] }))),
    ]);

    expect(blanks).toEqual([
      { answer: '1', aliases: [], tolerance: undefined },
      { answer: '2', aliases: ['二'], tolerance: undefined },
    ]);
    expect(stem).toHaveLength(1);
  });
});
