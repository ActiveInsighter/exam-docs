import { compile } from '@mdx-js/mdx';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import { getShortDocSlugPath } from '../lib/doc-paths.mjs';

const root = join(process.cwd(), 'content/docs/math/core-questions');

function pagesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? pagesIn(file) : entry.name.endsWith('.mdx') ? [file] : [];
  });
}

describe('Graduate mathematics core questions', () => {
  it('replaces the collection inside mock exams with a separate mathematics collection', () => {
    expect(existsSync(join(process.cwd(), 'content/docs/math/exam/core-questions'))).toBe(false);
    const math = JSON.parse(readFileSync(join(root, '../meta.json'), 'utf8'));
    const exams = JSON.parse(readFileSync(join(root, '../exam/meta.json'), 'utf8'));
    expect(math.pages).toContain('core-questions');
    expect(exams.pages).not.toContain('core-questions');
    expect(readFileSync(join(root, '../index.mdx'), 'utf8')).toContain('/docs/math/core-questions');
    expect(readFileSync(join(root, '../exam/index.mdx'), 'utf8')).not.toContain('./core-questions/');
  });

  for (const [subject, questionCount, topicCount] of [
    ['01-高等数学', 1800, 47],
    ['02-线性代数', 649, 29],
    ['03-概率论与数理统计', 570, 29],
  ] as const) {
    it(`renders every imported question, solution, formula and image in ${subject}`, async () => {
      const pages = pagesIn(join(root, subject));
      expect(pages).toHaveLength(topicCount + 1);
      let total = 0;
      const renderErrors: string[] = [];
      for (const page of pages) {
        const content = readFileSync(page, 'utf8');
        const questions = [...content.matchAll(/<ExamQuestion>([\s\S]*?)<\/ExamQuestion>/gu)];
        expect(content.match(/<ExamQuestion>/gu)?.length ?? 0, page).toBe(questions.length);
        for (const [, question] of questions) {
          expect(question, page).toMatch(/<ExamSolution>[\s\S]*<\/ExamSolution>/u);
          expect(question, page).toMatch(/<ExamAnswer>\s*\S[\s\S]*<\/ExamAnswer>/u);
          expect(question, page).toMatch(/<ExamExplanation>\s*\S[\s\S]*<\/ExamExplanation>/u);
        }
        total += questions.length;
        for (const [image] of content.matchAll(/\/img\/[^\s)"'>]+/gu)) {
          expect(existsSync(join(process.cwd(), 'public', image)), `${page}: ${image}`).toBe(true);
        }
        try {
          const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');
          const result = await compile({ value: body, path: page }, {
            remarkPlugins: [remarkMath],
            rehypePlugins: [[rehypeKatex, { strict: 'ignore', output: 'html' }]],
          });
          if (String(result).includes('katex-error')) {
            renderErrors.push(`${page}: ${result.messages.map(String).join('; ') || 'KaTeX render error'}`);
          }
        } catch (error) {
          renderErrors.push(`${page}: ${String(error)}`);
        }
      }
      expect(total).toBe(questionCount);
      expect(renderErrors).toEqual([]);
    }, 120_000);
  }

  it('keeps every subject, module and topic reachable through the sidebar', () => {
    const visit = (directory: string) => {
      const meta = JSON.parse(readFileSync(join(directory, 'meta.json'), 'utf8'));
      const children = readdirSync(directory, { withFileTypes: true });
      const expected = children.filter((entry) => entry.isDirectory() || entry.name.endsWith('.mdx'))
        .map((entry) => entry.name.replace(/\.mdx$/u, ''));
      expect(meta.pages.slice().sort(), directory).toEqual(expected.sort());
      for (const entry of children.filter((item) => item.isDirectory())) visit(join(directory, entry.name));
    };
    visit(root);
  });

  it('links collection and subject entry pages to generated document routes', () => {
    const routes = new Set(pagesIn(root).map((page) =>
      `/docs/${getShortDocSlugPath(page.slice(join(process.cwd(), 'content/docs').length + 1))}`,
    ));
    for (const page of pagesIn(root).filter((page) => page.endsWith('/index.mdx'))) {
      for (const [, href] of readFileSync(page, 'utf8').matchAll(/\]\(([^)]+)\)/gu)) {
        expect(routes.has(href), `${page}: ${href}`).toBe(true);
      }
    }
  });
});
