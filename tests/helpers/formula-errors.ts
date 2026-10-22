import katex from 'katex';
import type { Node, Parent } from 'unist';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkMdx).use(remarkMath);

type MathNode = Node & { type: 'math' | 'inlineMath'; value: string };

function collectMath(node: Node, out: MathNode[] = []): MathNode[] {
  if (node.type === 'math' || node.type === 'inlineMath') out.push(node as MathNode);
  for (const child of (node as Partial<Parent>).children ?? []) collectMath(child, out);
  return out;
}

/**
 * Formulas that would render as `katex-error` in the site build.
 *
 * Equivalent to compiling the MDX with remark-math + rehype-katex
 * ({ strict: 'ignore', output: 'html' }) and searching for `katex-error`:
 * rehype-katex renders each math node's text with `throwOnError: true` and
 * emits the error markup exactly when that throws. Parsing with the same MDX
 * syntax still rejects invalid documents, but skips the hast/estree/JS code
 * generation that made the old check take minutes. Throws on invalid MDX.
 */
export function findFormulaErrors(source: string): string[] {
  const errors: string[] = [];
  for (const node of collectMath(parser.parse(source))) {
    try {
      katex.renderToString(node.value, {
        displayMode: node.type === 'math',
        output: 'html',
        strict: 'ignore',
        throwOnError: true,
      });
    } catch (error) {
      errors.push(`line ${node.position?.start.line ?? '?'}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}
