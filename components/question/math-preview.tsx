import { Fragment, type ReactNode } from 'react';
import { parseMath, type MathNode } from '@/lib/math-expression';

/*
 * Lightweight typeset preview of a parsed expression: stacked fractions,
 * radicals with a vinculum, superscripts and italic variables, in the KaTeX
 * fonts the page already loads. No KaTeX runtime is shipped to the browser
 * for this.
 */

const FUNCTION_NAMES: Record<string, string> = { abs: '', sqrt: '√', cbrt: '∛' };

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };

function precedence(node: MathNode): number {
  if (node.type === 'binary') return PRECEDENCE[node.op];
  if (node.type === 'negate') return 3;
  if (node.type === 'equation') return 0;
  return 5;
}

function wrap(node: MathNode, minimum: number): ReactNode {
  const inner = render(node);
  return precedence(node) < minimum ? <>({inner})</> : inner;
}

function render(node: MathNode): ReactNode {
  switch (node.type) {
    case 'number':
      return node.raw;
    case 'constant':
      return node.name === 'pi' ? 'π' : <var>e</var>;
    case 'variable':
      return <var>{node.name}</var>;
    case 'group':
      // Parentheses around a whole fraction numerator or radicand read better without them.
      return <>({render(node.arg)})</>;
    case 'negate':
      return <>−{wrap(node.arg, 3)}</>;
    case 'postfix':
      return <>{wrap(node.arg, 5)}{node.op}</>;
    case 'equation':
      return <>{render(node.left)} = {render(node.right)}</>;
    case 'binary': {
      if (node.op === '/') {
        const strip = (part: MathNode) => (part.type === 'group' ? part.arg : part);
        return (
          <span data-math-frac="">
            <span>{render(strip(node.left))}</span>
            <span>{render(strip(node.right))}</span>
          </span>
        );
      }
      if (node.op === '^') {
        const exponent = node.right.type === 'group' ? node.right.arg : node.right;
        return <>{wrap(node.left, 5)}<sup>{render(exponent)}</sup></>;
      }
      if (node.op === '*') {
        return node.implicit
          ? <>{wrap(node.left, 2)}{wrap(node.right, 2)}</>
          : <>{wrap(node.left, 2)} × {wrap(node.right, 2)}</>;
      }
      const right = node.op === '-' ? wrap(node.right, 2) : render(node.right);
      return <>{render(node.left)} {node.op === '-' ? '−' : '+'} {right}</>;
    }
    case 'call': {
      const args = node.args.map((arg, index) => (
        <Fragment key={index}>{index > 0 ? ', ' : null}{render(arg.type === 'group' ? arg.arg : arg)}</Fragment>
      ));
      const power = node.power ? <sup>{render(node.power)}</sup> : null;
      if (node.fn === 'abs') return <>|{args}|{power}</>;
      if (node.fn === 'sqrt' || node.fn === 'cbrt') {
        return (
          <span data-math-sqrt="">
            <span>{FUNCTION_NAMES[node.fn]}</span>
            <span>{args}</span>
            {power}
          </span>
        );
      }
      return <>{node.fn}{power}({args})</>;
    }
  }
}

export function MathPreview({ text, fallback, className }: { text: string; fallback?: ReactNode; className?: string }) {
  if (!text.trim()) return <span data-math-preview="" className={className}>{fallback ?? null}</span>;
  const parsed = parseMath(text);
  return (
    <span data-math-preview="" className={className}>
      {parsed.ok ? render(parsed.node) : <span>{text}</span>}
    </span>
  );
}
