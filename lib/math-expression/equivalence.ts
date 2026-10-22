import { evaluateMath, type MathScope } from './evaluate';
import { mathVariables, parseMath, type MathNode } from './parse';

/*
 * Numeric equivalence of two expressions.
 *
 * Constant expressions are compared by value (√2/2 = 1/√2 = 0.7071067811865476…).
 * Expressions with variables are evaluated at fixed pseudo-random points on
 * both sides of zero; they are equal when every point where either side is
 * defined agrees. Equations a = b are compared through a − b up to a
 * non-zero constant factor, so y = 2x + 1 matches 2x − y + 1 = 0.
 *
 * This is the method most online homework systems use. It cannot tell an
 * unsimplified answer from a simplified one, so questions that grade the form
 * of an answer ("化简") should use a text blank.
 */

export type MathComparison =
  | { status: 'equal' }
  | { status: 'different' }
  | { status: 'invalid'; error: string };

export type MathCompareOptions = {
  /** Absolute tolerance; defaults to a tight relative tolerance (1e-9). */
  tolerance?: number;
};

const SAMPLE_COUNT = 14;
const MIN_COMPARABLE = 5;

/** Deterministic samples, so a grade never changes between renders or devices. */
function samplePoints(variables: readonly string[]): MathScope[] {
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const scope: Record<string, number> = {};
    // Mostly positive points (√x, ln x), some negative ones (|x|, odd functions).
    const sign = index % 3 === 2 ? -1 : 1;
    for (const name of variables) scope[name] = sign * (0.15 + random() * 2.6);
    return scope;
  });
}

function close(left: number, right: number, tolerance?: number): boolean {
  if (tolerance !== undefined) return Math.abs(left - right) <= tolerance + 1e-12;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-9 * scale;
}

function compareValues(input: MathNode, expected: MathNode, options: MathCompareOptions): boolean {
  const variables = [...mathVariables(input, mathVariables(expected))].sort();
  if (!variables.length) {
    const left = evaluateMath(input);
    const right = evaluateMath(expected);
    return Number.isFinite(left) && Number.isFinite(right) && close(left, right, options.tolerance);
  }
  let comparable = 0;
  for (const scope of samplePoints(variables)) {
    const left = evaluateMath(input, scope);
    const right = evaluateMath(expected, scope);
    const leftDefined = Number.isFinite(left);
    const rightDefined = Number.isFinite(right);
    if (!leftDefined && !rightDefined) continue;
    if (leftDefined !== rightDefined) return false;
    if (!close(left, right, options.tolerance)) return false;
    comparable++;
  }
  return comparable >= MIN_COMPARABLE;
}

/** a − b of both equations must be proportional with one non-zero factor. */
function compareEquations(input: MathNode, expected: MathNode): boolean {
  const variables = [...mathVariables(input, mathVariables(expected))].sort();
  if (!variables.length) return false;
  let ratio: number | null = null;
  let comparable = 0;
  for (const scope of samplePoints(variables)) {
    const left = evaluateMath(input, scope);
    const right = evaluateMath(expected, scope);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    if (Math.abs(right) < 1e-12) {
      if (Math.abs(left) > 1e-9) return false;
      continue;
    }
    const current = left / right;
    if (Math.abs(current) < 1e-12) return false;
    if (ratio === null) ratio = current;
    else if (!close(current, ratio)) return false;
    comparable++;
  }
  return comparable >= MIN_COMPARABLE;
}

export function compareMathNodes(input: MathNode, expected: MathNode, options: MathCompareOptions = {}): boolean {
  const inputEquation = input.type === 'equation';
  if (inputEquation !== (expected.type === 'equation')) return false;
  return inputEquation ? compareEquations(input, expected) : compareValues(input, expected, options);
}

export function compareMath(input: string, expected: string, options: MathCompareOptions = {}): MathComparison {
  const parsedInput = parseMath(input);
  if (!parsedInput.ok) return { status: 'invalid', error: parsedInput.error };
  const parsedExpected = parseMath(expected);
  if (!parsedExpected.ok) return { status: 'invalid', error: `参考答案无法解析：${parsedExpected.error}` };
  return { status: compareMathNodes(parsedInput.node, parsedExpected.node, options) ? 'equal' : 'different' };
}
