import type { MathFunction, MathNode } from './parse';

/*
 * Numeric evaluation of a parsed tree. Domain errors (ln of a negative,
 * division by zero, …) evaluate to NaN or ±Infinity instead of throwing, so
 * the equivalence check can simply skip sample points outside a domain.
 */

export type MathScope = Readonly<Record<string, number>>;

const FUNCTIONS: Record<Exclude<MathFunction, 'log'>, (value: number) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (value) => 1 / Math.tan(value),
  sec: (value) => 1 / Math.cos(value),
  csc: (value) => 1 / Math.sin(value),
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  ln: Math.log,
  lg: Math.log10,
  exp: Math.exp,
};

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0) return Number.NaN;
  if (value > 170) return Number.POSITIVE_INFINITY;
  let result = 1;
  for (let factor = 2; factor <= value; factor++) result *= factor;
  return result;
}

/** Real power: a negative base allows odd roots written as fractions, e.g. (-8)^(1/3). */
function power(base: number, exponent: number): number {
  if (base >= 0 || Number.isInteger(exponent)) return base ** exponent;
  for (const denominator of [3, 5, 7, 9]) {
    const numerator = exponent * denominator;
    if (Math.abs(numerator - Math.round(numerator)) < 1e-9) {
      const root = -((-base) ** (1 / denominator));
      return root ** Math.round(numerator);
    }
  }
  return Number.NaN;
}

export function evaluateMath(node: MathNode, scope: MathScope = {}): number {
  switch (node.type) {
    case 'number': return node.value;
    case 'constant': return node.name === 'pi' ? Math.PI : Math.E;
    case 'variable': return scope[node.name] ?? Number.NaN;
    case 'group': return evaluateMath(node.arg, scope);
    case 'negate': return -evaluateMath(node.arg, scope);
    case 'postfix': {
      const value = evaluateMath(node.arg, scope);
      return node.op === '%' ? value / 100 : factorial(value);
    }
    case 'binary': {
      const left = evaluateMath(node.left, scope);
      const right = evaluateMath(node.right, scope);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '^': return power(left, right);
      }
      break;
    }
    case 'call': {
      const args = node.args.map((arg) => evaluateMath(arg, scope));
      const value = node.fn === 'log'
        ? (args.length === 2 ? Math.log(args[1]) / Math.log(args[0]) : Math.log10(args[0]))
        : FUNCTIONS[node.fn](args[0]);
      return node.power ? power(value, evaluateMath(node.power, scope)) : value;
    }
    case 'equation':
      return evaluateMath(node.left, scope) - evaluateMath(node.right, scope);
  }
  return Number.NaN;
}
