import { evaluate } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import type { Pluggable } from 'unified';
import { describe, expect, it } from 'vitest';
import { Blank, Option, Question, Solution } from '@/components/question';
import { getChoiceDensity } from '@/components/question/choice-layout';
import { rehypeKatexHtml } from '@/lib/rehype-katex-html';
import { remarkQuestion } from '@/lib/remark-question';

const katex: Pluggable = [rehypeKatex, { strict: 'ignore', output: 'html' }];

async function compile(source: string, prerender: boolean) {
  const { default: Content } = await evaluate(
    { value: source, path: 'test.mdx' },
    {
      ...runtime,
      remarkPlugins: [remarkQuestion, remarkMath],
      rehypePlugins: prerender ? [katex, rehypeKatexHtml] : [katex],
    },
  );
  return Content;
}

async function render(source: string, prerender: boolean) {
  const Content = await compile(source, prerender);
  return renderToStaticMarkup(
    createElement(Content, { components: { Question, Option, Blank, Solution } }),
  );
}

/**
 * Serialiser differences that parse to the same DOM: React writes `style`
 * objects without KaTeX's trailing semicolon and escapes `>` in text.
 */
const normalizeStyles = (html: string) => html.replace(/;"/gu, '"').replaceAll('&gt;', '>');

const chapter = readFileSync(
  join(process.cwd(), 'content/docs/math/lilin-880/线性代数/15-第十五章-二次型.mdx'),
  'utf8',
).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');

function countElements(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + countElements(child), 0);
  if (node && typeof node === 'object' && 'props' in node) {
    const { children } = (node as { props: { children?: unknown } }).props;
    return 1 + countElements(children);
  }
  return 0;
}

/** Counts KaTeX internals still present as React elements, e.g. inside <Question> children. */
function countKatexElements(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + countKatexElements(child), 0);
  if (node && typeof node === 'object' && 'props' in node) {
    const { children, className } = (node as { props: { children?: unknown; className?: unknown } }).props;
    return (className === 'katex-html' ? 1 : 0) + countKatexElements(children);
  }
  return 0;
}

describe('rehypeKatexHtml', () => {
  it('pre-renders formulas nested inside question components', async () => {
    const [tree, prerendered] = await Promise.all([compile(chapter, false), compile(chapter, true)]);
    const components = { Question, Option, Blank, Solution };
    expect(countKatexElements(tree({ components }))).toBeGreaterThan(100);
    expect(countKatexElements(prerendered({ components }))).toBe(0);
  });

  it('renders the same HTML for a math-heavy chapter', async () => {
    const [tree, prerendered] = await Promise.all([render(chapter, false), render(chapter, true)]);
    expect(prerendered).toContain('<span class="katex"><span class="katex-html"');
    expect(normalizeStyles(prerendered)).toBe(normalizeStyles(tree));
  });

  it('turns each formula into a single element', async () => {
    const source = '设 $A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$，则\n\n$$\n\\frac{1}{2}x^2\n$$\n';
    const [treeContent, prerenderedContent] = await Promise.all([
      compile(source, false),
      compile(source, true),
    ]);
    const tree = countElements(treeContent({}));
    const prerendered = countElements(prerenderedContent({}));
    // Root fragment + paragraph + inline formula + display formula.
    expect(prerendered).toBe(4);
    expect(tree).toBeGreaterThan(prerendered * 10);
  });

  it('keeps formulas in headings as pre-rendered spans', async () => {
    const html = await render('## 求 $x^2$ 的极值\n', true);
    expect(html).toMatch(/<h2[^>]*>求 <span class="katex"><span class="katex-html"/u);
  });

  it('leaves the server choice density unchanged', async () => {
    const options = [
      '$\\frac{1}{2}$',
      '$x_1+x_2+x_3+x_4+x_5$ 是方程组的一组基础解系',
      '$A$',
      '$abcdefghijk$',
    ];
    for (const option of options) {
      const [tree, prerendered] = await Promise.all([
        compile(option, false),
        compile(option, true),
      ]);
      expect(getChoiceDensity([prerendered({})])).toBe(getChoiceDensity([tree({})]));
    }
  });
});
