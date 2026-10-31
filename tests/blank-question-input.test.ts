import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  blankGradeToken,
  evaluateAttempt,
  readBlankGrades,
  withBlankGrade,
  type BlankSpec,
  type GradingSpec,
} from '@/components/question/grading';
import { deleteBackward, insertFraction, insertText, moveCaret, wrapSelection } from '@/components/question/math-editing';
import { MathPreview } from '@/components/question/math-preview';

const at = (position: number) => ({ start: position, end: position });

describe('maths keypad edits', () => {
  it('inserts at the caret and replaces a selection', () => {
    expect(insertText('a+b', at(1), '²')).toEqual({ value: 'a²+b', caret: 2 });
    expect(insertText('a+b', { start: 0, end: 1 }, 'x')).toEqual({ value: 'x+b', caret: 1 });
    expect(insertText('', at(0), 'log(,)', 2)).toEqual({ value: 'log(,)', caret: 4 });
  });

  it('steps over the closing bracket a template left', () => {
    expect(insertText('√(2)', at(3), ')')).toEqual({ value: '√(2)', caret: 4 });
  });

  it('wraps a selection or leaves the caret inside an empty pair', () => {
    expect(wrapSelection('x', at(1), 'sin(', ')')).toEqual({ value: 'xsin()', caret: 5 });
    expect(wrapSelection('a+b', { start: 0, end: 3 }, '√(', ')')).toEqual({ value: '√(a+b)', caret: 6 });
  });

  it('makes a selection the numerator of a fraction', () => {
    expect(insertFraction('a+b', { start: 0, end: 3 })).toEqual({ value: '(a+b)/', caret: 6 });
    expect(insertFraction('2', at(1))).toEqual({ value: '2/', caret: 2 });
  });

  it('deletes function openers and empty pairs as one unit', () => {
    expect(deleteBackward('sin()', 4, 4)).toEqual({ value: '', caret: 0 });
    expect(deleteBackward('x^()', 3, 3)).toEqual({ value: 'x', caret: 1 });
    expect(deleteBackward('||', 1, 1)).toEqual({ value: '', caret: 0 });
    expect(deleteBackward('ab', 2, 2)).toEqual({ value: 'a', caret: 1 });
    expect(deleteBackward('ab', 0, 0)).toEqual({ value: 'ab', caret: 0 });
  });

  it('moves the caret within bounds and collapses a selection', () => {
    expect(moveCaret('abc', at(0), -1)).toBe(0);
    expect(moveCaret('abc', at(3), 1)).toBe(3);
    expect(moveCaret('abc', { start: 1, end: 2 }, -1)).toBe(1);
    expect(moveCaret('abc', { start: 1, end: 2 }, 1)).toBe(2);
  });
});

describe('manual grading of blanks', () => {
  const math = (answer: string): BlankSpec => ({ answer, aliases: [], kind: 'math' });
  const text = (answer: string): BlankSpec => ({ answer, aliases: [], kind: 'text' });
  const spec: GradingSpec = { kind: 'blank', blanks: [text('k(1,1,0)ᵀ'), math('2')] };

  it('stores one token per overridden blank', () => {
    const one = withBlankGrade([], 0, 'correct');
    expect(one).toEqual([blankGradeToken(0, 'correct')]);
    const two = withBlankGrade(one, 1, 'incorrect');
    expect(readBlankGrades(two, 2)).toEqual(['correct', 'incorrect']);
    expect(withBlankGrade(two, 0, null)).toEqual([blankGradeToken(1, 'incorrect')]);
    expect(readBlankGrades(['A', 'blank:7:correct'], 2)).toEqual([undefined, undefined]);
  });

  it('applies the reader’s grade over the automatic one', () => {
    const values = ['γ=k(1,1,0)^T', '2'];
    expect(evaluateAttempt(spec, [], values)).toMatchObject({ result: 'partial', blanks: ['incorrect', 'correct'] });
    const graded = evaluateAttempt(spec, withBlankGrade([], 0, 'correct'), values);
    expect(graded).toEqual({ result: 'correct', blanks: ['correct', 'correct'], manual: [true, false] });
    const failed = evaluateAttempt(spec, [blankGradeToken(0, 'incorrect'), blankGradeToken(1, 'incorrect')], values);
    expect(failed.result).toBe('incorrect');
    expect(failed.manual).toEqual([false, true]);
  });
});

describe('MathPreview', () => {
  it('stacks a fraction with its exponents inside each part', () => {
    const html = renderToStaticMarkup(createElement(MathPreview, { text: '(a^2-b^2)/(a^2+b^2)' }));
    expect(html).toBe(
      '<span data-math-preview=""><span data-math-frac=""><span><var>a</var><sup>2</sup> − <var>b</var><sup>2</sup></span>'
      + '<span><var>a</var><sup>2</sup> + <var>b</var><sup>2</sup></span></span></span>',
    );
  });

  it('draws radicals, functions and implicit products', () => {
    const html = renderToStaticMarkup(createElement(MathPreview, { text: '2√(3)+sin(x)' }));
    expect(html).toContain('<span data-math-sqrt=""><span>√</span><span>3</span></span>');
    expect(html).toContain('sin(<var>x</var>)');
  });
});
