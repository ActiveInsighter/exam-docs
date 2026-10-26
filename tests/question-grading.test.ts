import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  evaluateAttempt,
  formatResponse,
  gradeBlank,
  gradeBlanks,
  gradeChoice,
  inferBlankKind,
  isBlankCorrect,
  normalizeBlankText,
  parseBlankNumber,
  type BlankSpec,
} from '@/components/question/grading';
import { Blank, Option, Solution } from '@/components/question/parts';
import { buildGradingSpec, indexBlanks, parseQuestionTags, splitQuestion } from '@/components/question/model';

const text = (answer: string, extra: Partial<BlankSpec> = {}): BlankSpec => ({ answer, aliases: [], kind: 'text', ...extra });
const math = (answer: string, extra: Partial<BlankSpec> = {}): BlankSpec => ({ answer, aliases: [], kind: 'math', ...extra });

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
    expect(isBlankCorrect('传输 层', text('传输层'))).toBe(true);
  });

  it('accepts aliases', () => {
    const spec = text('0.5', { aliases: ['1/2'] });
    expect(isBlankCorrect('1/2', spec)).toBe(true);
    expect(isBlankCorrect('0.25', spec)).toBe(false);
  });

  it('accepts numbers within the tolerance, including fractions and percentages', () => {
    const spec = text('3.14', { tolerance: 0.01 });
    expect(isBlankCorrect('3.141', spec)).toBe(true);
    expect(isBlankCorrect('3.2', spec)).toBe(false);
    expect(parseBlankNumber('1/4')).toBe(0.25);
    expect(parseBlankNumber('50%')).toBe(0.5);
    expect(parseBlankNumber('abc')).toBeNull();
    expect(isBlankCorrect('1/2', text('0.5', { tolerance: 0 }))).toBe(true);
  });

  it('never accepts an empty entry', () => {
    expect(isBlankCorrect('  ', text(''))).toBe(false);
    expect(gradeBlank('  ', math('1'))).toBe('empty');
  });

  it('grades several blanks together', () => {
    const specs = [text('传输层'), math('3')];
    expect(gradeBlanks(['传输层', '3'], specs).result).toBe('correct');
    expect(gradeBlanks(['传输层', '2'], specs)).toEqual({
      result: 'partial',
      verdicts: ['correct', 'incorrect'],
      correct: [true, false],
    });
    expect(gradeBlanks(['', ''], specs).result).toBe('incorrect');
  });
});

describe('maths blanks', () => {
  it('picks the maths keypad for numeric answers unless the author chose', () => {
    expect(inferBlankKind('3')).toBe('math');
    expect(inferBlankKind('-1/2')).toBe('math');
    expect(inferBlankKind('2√3')).toBe('math');
    expect(inferBlankKind('π/4')).toBe('math');
    expect(inferBlankKind('传输层')).toBe('text');
    expect(inferBlankKind('O(n)')).toBe('text');
    expect(inferBlankKind('x+1')).toBe('text');
  });

  it('accepts equivalent expressions and reports unreadable input', () => {
    const spec = math('sqrt(2)/2');
    expect(gradeBlank('1/√2', spec)).toBe('correct');
    expect(gradeBlank('√2÷2', spec)).toBe('correct');
    expect(gradeBlank('0.7', spec)).toBe('incorrect');
    expect(gradeBlank('√(2', spec)).toBe('invalid');
    expect(gradeBlank('(x+1)^2', math('x^2+2x+1'))).toBe('correct');
    expect(gradeBlank('0.707', math('√2/2', { tolerance: 0.001 }))).toBe('correct');
  });
});

describe('attempt evaluation', () => {
  it('grades boolean answers through their stored letters', () => {
    expect(evaluateAttempt({ kind: 'boolean', answer: true }, ['A'], []).result).toBe('correct');
    expect(evaluateAttempt({ kind: 'boolean', answer: true }, ['B'], []).result).toBe('incorrect');
    expect(formatResponse({ kind: 'boolean', answer: true }, ['B'], [])).toBe('错误');
  });

  it('keeps per-blank verdicts', () => {
    const evaluation = evaluateAttempt({ kind: 'blank', blanks: [text('甲'), math('2')] }, [], ['甲', '1+1']);
    expect(evaluation).toEqual({ result: 'correct', blanks: ['correct', 'correct'] });
  });
});

describe('built-in tags', () => {
  it('splits a comma list or reads an array, with optional categories', () => {
    expect(parseQuestionTags('2023 统考, 数据结构，易错、 易错')).toEqual({
      type: [{ label: '易错', kind: 'type' }],
      source: [{ label: '2023 统考', kind: 'source' }, { label: '数据结构', kind: 'source' }],
      point: [],
    });
    expect(parseQuestionTags(['来源:2023 统考', '来源：模拟卷']).source).toEqual([
      { label: '2023 统考', group: '来源', kind: 'source' },
      { label: '模拟卷', group: '来源', kind: 'source' },
    ]);
    expect(parseQuestionTags(undefined)).toEqual({ type: [], source: [], point: [] });
  });

  it('files each tag under type, source or point by its category', () => {
    const tags = parseQuestionTags('王道8套卷, 第4套, 计算机网络, 考点:VLAN广播域, 知识点：NAT, 难度:较难, 章节:网络层, 年份:2024');
    expect(tags.source.map((tag) => tag.label)).toEqual(['王道8套卷', '第4套', '计算机网络', '网络层', '2024']);
    expect(tags.point.map((tag) => tag.label)).toEqual(['VLAN广播域', 'NAT']);
    expect(tags.type).toEqual([{ label: '较难', group: '难度', kind: 'type' }]);
  });

  it('keeps the same label apart across kinds and caps each kind', () => {
    const tags = parseQuestionTags(['考点:栈', '栈', ...Array.from({ length: 20 }, (_, index) => `考点:点${index}`)]);
    expect(tags.source).toEqual([{ label: '栈', kind: 'source' }]);
    expect(tags.point).toHaveLength(12);
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
    expect(buildGradingSpec({ type: 'single', options, blanks: [] })).toEqual({ kind: 'choice', multiple: false, key: ['B'] });
    expect(buildGradingSpec({ type: 'multiple', options, blanks: [] })).toBeNull();
    // Essays are graded by the reader against the reference solution.
    expect(buildGradingSpec({ type: 'essay', options, blanks: [] })).toEqual({ kind: 'self' });
    expect(buildGradingSpec({ type: 'boolean', answer: false, options: [], blanks: [] })).toEqual({ kind: 'boolean', answer: false });
    expect(buildGradingSpec({ type: 'boolean', options: [], blanks: [] })).toBeNull();
  });

  it('reads an essay self-grade from its stored letter', () => {
    const spec = { kind: 'self' } as const;
    expect(evaluateAttempt(spec, ['A'], []).result).toBe('correct');
    expect(evaluateAttempt(spec, ['B'], []).result).toBe('partial');
    expect(evaluateAttempt(spec, ['C'], []).result).toBe('incorrect');
    expect(formatResponse(spec, ['B'], [])).toBe('部分正确');
    expect(formatResponse(spec, [], [])).toBe('—');
  });

  it('numbers blanks in document order and collects their answers', () => {
    const { stem, blanks } = indexBlanks([
      createElement('p', { key: 'p' }, '甲', createElement(Blank, { answer: '1' }), '乙', createElement('em', null, createElement(Blank, { answer: 2, aliases: ['二'] }))),
    ]);

    expect(blanks).toEqual([
      { answer: '1', aliases: [], tolerance: undefined, kind: 'math' },
      { answer: '2', aliases: ['二'], tolerance: undefined, kind: 'math' },
    ]);
    expect(stem).toHaveLength(1);
  });
});
