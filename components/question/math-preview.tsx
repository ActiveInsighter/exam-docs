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

function precedence(node: MathNode): number {
  if (node.type === 'binary') return PRECEDENCE[node.op];
  if (node.type === 'negate') return 3;
  if (node.type === 'equation') return 0;
  return 5;
}

function wrap(node: MathNode, minimum: number): Box[] {
  const inner = layout(node);
  return precedence(node) < minimum ? ['(', ...inner, ')'] : inner;
}

const strip = (part: MathNode) => (part.type === 'group' ? part.arg : part);

function layout(node: MathNode): Box[] {
  switch (node.type) {
    case 'number':
      return [node.raw];
    case 'constant':
      return node.name === 'pi' ? ['π'] : [box('var', ['e'])];
    case 'variable':
      return [box('var', [node.name])];
    case 'group':
      return ['(', ...layout(node.arg), ')'];
    case 'negate':
      return ['−', ...wrap(node.arg, 3)];
    case 'postfix':
      return [...wrap(node.arg, 5), node.op];
    case 'equation':
      return [...layout(node.left), ' = ', ...layout(node.right)];
    case 'binary': {
      if (node.op === '/') {
        // Brackets around a whole numerator or denominator read better without them.
        return [box('span', [box('span', layout(strip(node.left))), box('span', layout(strip(node.right)))], 'data-math-frac')];
      }
      if (node.op === '^') return [...wrap(node.left, 5), box('sup', layout(strip(node.right)))];
      if (node.op === '*') {
        return node.implicit
          ? [...wrap(node.left, 2), ...wrap(node.right, 2)]
          : [...wrap(node.left, 2), ' × ', ...wrap(node.right, 2)];
      }
      const right = node.op === '-' ? wrap(node.right, 2) : layout(node.right);
      return [...layout(node.left), node.op === '-' ? ' − ' : ' + ', ...right];
    }
    case 'call': {
      const args = node.args.flatMap((arg, index) => [...(index > 0 ? [', '] : []), ...layout(strip(arg))]);
      const power = node.power ? [box('sup', layout(node.power))] : [];
      if (node.fn === 'abs') return ['|', ...args, '|', ...power];
      if (node.fn === 'sqrt' || node.fn === 'cbrt') {
        return [box('span', [box('span', [node.fn === 'sqrt' ? '√' : '∛']), box('span', args), ...power], 'data-math-sqrt')];
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
