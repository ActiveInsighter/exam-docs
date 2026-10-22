import { describe, expect, it } from 'vitest';
import { compareMath, evaluateMath, parseMath } from '@/lib/math-expression';

const value = (text: string) => {
  const parsed = parseMath(text);
  if (!parsed.ok) throw new Error(`${text}: ${parsed.error}`);
  return evaluateMath(parsed.node);
};

describe('math expression parser', () => {
  it('follows the usual precedence and associativity', () => {
    expect(value('-2^2')).toBe(-4);
    expect(value('2^3^2')).toBe(512);
    expect(value('2^-1')).toBe(0.5);
    expect(value('1+2*3')).toBe(7);
    expect(value('3!')).toBe(6);
    expect(value('50%')).toBe(0.5);
  });

  it('reads typed and keypad notation alike', () => {
    expect(value('（1＋2）×3')).toBe(9);
    expect(value('6÷3−1')).toBe(1);
    expect(value('2²')).toBe(4);
    expect(value('√16')).toBe(4);
    expect(value('2π')).toBeCloseTo(2 * Math.PI);
  });

  it('reports incomplete or unknown input instead of throwing', () => {
    for (const text of ['1+', '(1', '1)', 'sin', '2**', ')', 'x=1=2', '@', '', 'log(1,2,3)']) {
      expect([text, parseMath(text).ok]).toEqual([text, false]);
    }
    expect(parseMath('x'.repeat(201)).ok).toBe(false);
    expect(parseMath('('.repeat(60) + '1' + ')'.repeat(60)).ok).toBe(false);
  });
});

describe('math equivalence', () => {
  it.each([
    ['1/2', '0.5'], ['√2/2', '1/√2'], ['2x+1', '1+2*x'], ['x^2-1', '(x-1)(x+1)'],
    ['sin^2x+cos^2x', '1'], ['|x|', 'sqrt(x^2)'], ['2π', '2pi'], ['50%', '1/2'],
    ['y=2x+1', '2x-y+1=0'], ['e^(ln 2)', '2'], ['log(2,8)', '3'], ['x²', 'x*x'],
    ['sinx', 'sin(x)'], ['||x|-1|', 'abs(abs(x)-1)'], ['(-8)^(1/3)', '-2'], ['ln(x^2)', '2ln|x|'],
  ])('%s equals %s', (input, expected) => {
    expect(compareMath(input, expected).status).toBe('equal');
  });

  it.each([
    ['1/3', '0.333'], ['x^2', 'x'], ['2x', 'x+3'], ['sqrt(x^2)', 'x'], ['y=2x', 'y=2x+1'], ['x', 'x=1'],
  ])('%s differs from %s', (input, expected) => {
    expect(compareMath(input, expected).status).toBe('different');
  });

  it('accepts an explicit absolute tolerance', () => {
    expect(compareMath('0.33', '1/3', { tolerance: 0.01 }).status).toBe('equal');
    expect(compareMath('0.3', '1/3', { tolerance: 0.01 }).status).toBe('different');
  });

  it('marks unreadable input as invalid', () => {
    expect(compareMath('1+', '1')).toEqual({ status: 'invalid', error: expect.any(String) });
  });
});
