import { createElement, Fragment, type ReactNode } from 'react';
import { parseMath, type MathNode } from '@/lib/math-expression';

/*
 * Lightweight typeset preview of a parsed expression: stacked fractions,
 * radicals with a vinculum, superscripts and italic variables, in the KaTeX
 * fonts the page already loads. No KaTeX runtime is shipped to the browser
 * for this.
 *
 * The layout is a small tree of boxes, drawn by React (MathPreview) or
 * straight into the DOM (typesetMath, for the solution card's copy of a
 * question, which is plain DOM).
 */

type Tag = 'span' | 'var' | 'sup';
type Box = string | { tag: Tag; attr?: 'data-math-frac' | 'data-math-sqrt'; children: Box[] };

const box = (tag: Tag, children: Box[], attr?: 'data-math-frac' | 'data-math-sqrt'): Box => ({ tag, attr, children });

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };

/** Thin space (KaTeX's \,) around operator names: 2x ln x, sin x cos x. */
const THIN = '\u2009';

function precedence(node: MathNode): number {
  if (node.type === 'binary') return PRECEDENCE[node.op];
  if (node.type === 'negate') return 3;
  if (node.type === 'equation') return 0;
  return 5;
}

/** Brackets nested in brackets read as one pair: ((y/x))² → (y/x)². */
function unwrap(node: MathNode): MathNode {
  return node.type === 'group' && node.arg.type === 'group' ? unwrap(node.arg) : node;
}

/** One pair of brackets less, for places that draw their own (numerator, exponent, √). */
const strip = (part: MathNode) => {
  const inner = unwrap(part);
  return inner.type === 'group' ? inner.arg : inner;
};

const isFraction = (node: MathNode) => node.type === 'binary' && node.op === '/';

/** sin, ln, … whose argument may be written without brackets. */
const isNamedCall = (node: MathNode) => node.type === 'call' && node.fn !== 'abs' && node.fn !== 'sqrt' && node.fn !== 'cbrt';

/**
 * Arguments that read unambiguously without brackets after an operator
 * name: sin x, ln 2, sin 2x, cos x², ln |x|, ln sin x.
 */
function isBareArgument(node: MathNode): boolean {
  switch (node.type) {
    case 'number':
    case 'variable':
    case 'constant':
      return true;
    case 'call':
      return node.fn === 'abs' || (isNamedCall(node) && node.args.length === 1 && isBareArgument(strip(node.args[0])));
    case 'binary':
      if (node.op === '*' && node.implicit) {
        return node.left.type === 'number' && (node.right.type === 'variable' || node.right.type === 'constant');
      }
      if (node.op === '^') {
        return (node.left.type === 'variable' || node.left.type === 'constant')
          && (strip(node.right).type === 'number' || strip(node.right).type === 'variable');
      }
      return false;
    default:
      return false;
  }
}

/**
 * How a node is placed: `base` when a superscript or postfix follows it
 * (a fraction or a bare function argument then needs its brackets back),
 * `factor` when another factor follows it in a product.
 */
type Place = 'free' | 'base' | 'factor';

function wrap(node: MathNode, minimum: number, place: Place = 'free'): Box[] {
  const inner = layout(node, place);
  return precedence(node) < minimum ? ['(', ...inner, ')'] : inner;
}

/** Does the factor begin with an operator name (sin x, ln x)? */
function startsWithCall(node: MathNode): boolean {
  if (isNamedCall(node)) return true;
  if (node.type === 'binary' && (node.op === '*' || node.op === '^')) return startsWithCall(node.left);
  return false;
}

function layout(node: MathNode, place: Place = 'free'): Box[] {
  switch (node.type) {
    case 'number':
      return [node.raw];
    case 'constant':
      return node.name === 'pi' ? ['π'] : [box('var', ['e'])];
    case 'variable':
      return [box('var', [node.name])];
    case 'group': {
      const inner = unwrap(node).type === 'group' ? (unwrap(node) as Extract<MathNode, { type: 'group' }>).arg : node.arg;
      // A stacked fraction is its own bracket: (1/2)(x+1) reads ½(x+1).
      if (isFraction(inner) && place !== 'base') return layout(inner);
      return ['(', ...layout(inner), ')'];
    }
    case 'negate':
      return ['−', ...wrap(node.arg, 3)];
    case 'postfix':
      return [...wrap(node.arg, 5, 'base'), node.op];
    case 'equation':
      return [...layout(node.left), ' = ', ...layout(node.right)];
    case 'binary': {
      if (node.op === '/') {
        // Brackets around a whole numerator or denominator read better without them.
        return [box('span', [box('span', layout(strip(node.left))), box('span', layout(strip(node.right)))], 'data-math-frac')];
      }
      if (node.op === '^') {
        const exponent = strip(node.right);
        // sin(x)² is sin²x.
        if (node.left.type === 'call' && isNamedCall(node.left) && !node.left.power) {
          return layout({ ...node.left, power: exponent }, place);
        }
        return [...wrap(node.left, 5, 'base'), box('sup', layout(exponent))];
      }
      if (node.op === '*') {
        const right = wrap(node.right, 2, place);
        if (!node.implicit) {
          // × between figures (2 × 3); a centred dot between other factors.
          const figures = node.left.type === 'number' && node.right.type === 'number';
          return [...wrap(node.left, 2), figures ? ' × ' : ' · ', ...right];
        }
        // sin x cos x and x ln x read as products; sin x · x would not, so
        // a bare argument keeps its brackets unless another name follows.
        const named = startsWithCall(node.right);
        return [...wrap(node.left, 2, named ? 'free' : 'factor'), ...(named ? [THIN] : []), ...right];
      }
      const right = node.op === '-' ? wrap(node.right, 2) : layout(node.right);
      return [...layout(node.left), node.op === '-' ? ' − ' : ' + ', ...right];
    }
    case 'call': {
      const args = node.args.flatMap((arg, index) => [...(index > 0 ? [', '] : []), ...layout(strip(arg))]);
      const power = node.power ? [box('sup', layout(strip(node.power)))] : [];
      if (node.fn === 'abs') return ['|', ...args, '|', ...power];
      if (node.fn === 'sqrt' || node.fn === 'cbrt') {
        return [box('span', [box('span', [node.fn === 'sqrt' ? '√' : '∛']), box('span', args), ...power], 'data-math-sqrt')];
      }
      // Operator names are upright; a simple argument goes without brackets
      // (sin x, ln |x|) unless something follows that would run into it.
      const bare = place === 'free' && node.args.length === 1 && isBareArgument(strip(node.args[0]));
      if (bare) {
        const arg = strip(node.args[0]);
        return [node.fn, ...power, ...(arg.type === 'call' && arg.fn === 'abs' ? [] : [THIN]), ...layout(arg)];
      }
      return [node.fn, ...power, '(', ...args, ')'];
    }
  }
}

/** The boxes for `text`, or null when it does not parse. */
function layoutText(text: string): Box[] | null {
  const parsed = parseMath(text);
  return parsed.ok ? layout(parsed.node) : null;
}

function toReact(boxes: Box[]): ReactNode {
  return boxes.map((item, index) => (typeof item === 'string'
    ? <Fragment key={index}>{item}</Fragment>
    : createElement(item.tag, { key: index, ...(item.attr ? { [item.attr]: '' } : {}) }, toReact(item.children))));
}

function toDom(boxes: Box[], parent: HTMLElement) {
  for (const item of boxes) {
    if (typeof item === 'string') {
      parent.append(item);
      continue;
    }
    const element = document.createElement(item.tag);
    if (item.attr) element.setAttribute(item.attr, '');
    toDom(item.children, element);
    parent.append(element);
  }
}

export function MathPreview({ text, fallback, className }: { text: string; fallback?: ReactNode; className?: string }) {
  if (!text.trim()) return <span data-math-preview="" className={className}>{fallback ?? null}</span>;
  const boxes = layoutText(text);
  return (
    <span data-math-preview="" className={className}>
      {boxes ? toReact(boxes) : <span>{text}</span>}
    </span>
  );
}

/** The same preview as plain DOM. */
export function typesetMath(text: string): HTMLElement {
  const element = document.createElement('span');
  element.dataset.mathPreview = '';
  const boxes = text.trim() ? layoutText(text) : null;
  if (boxes) toDom(boxes, element);
  else element.textContent = text;
  return element;
}
