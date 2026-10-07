import { compile } from '@mdx-js/mdx';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'content/docs/math/past-exams');

function pagesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? pagesIn(file) : entry.name.endsWith('.mdx') ? [file] : [];
  });
}

describe('October 7 mathematics past-exam imports', () => {
  for (const [folder, questionCount, pageCount] of [
    ['04-线性代数', 343, 20],
    ['03-概率论与数理统计', 294, 17],
  ] as const) {
    it(`renders every question, solution and formula in ${folder}`, async () => {
      const directory = join(root, folder);
      const pages = pagesIn(directory);
      expect(pages).toHaveLength(pageCount);
      let total = 0;

      for (const page of pages) {
        const content = readFileSync(page, 'utf8');
        expect(content, page).not.toMatch(/图片占位|待补充|待完善|TODO|FIXME/u);
        const questions = [...content.matchAll(/<ExamQuestion>([\s\S]*?)<\/ExamQuestion>/gu)];
        expect(content.match(/<ExamQuestion>/gu)?.length ?? 0, page).toBe(questions.length);
        for (const [, question] of questions) {
          expect(question, page).toMatch(/<ExamSolution>[\s\S]*<\/ExamSolution>/u);
          expect(question, page).toMatch(/<ExamAnswer>\s*\S[\s\S]*<\/ExamAnswer>/u);
          expect(question, page).toMatch(/<ExamExplanation>\s*\S[\s\S]*<\/ExamExplanation>/u);
        }
        total += questions.length;

        const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');
        const result = await compile(body, {
          remarkPlugins: [remarkMath],
          rehypePlugins: [[rehypeKatex, { strict: 'ignore', output: 'html' }]],
        });
        expect(String(result), page).not.toContain('katex-error');
      }
      expect(total).toBe(questionCount);
    }, 60_000);

    it(`keeps every chapter and section reachable in ${folder}`, () => {
      const visit = (directory: string) => {
        const meta = JSON.parse(readFileSync(join(directory, 'meta.json'), 'utf8'));
        const children = readdirSync(directory, { withFileTypes: true });
        const expected = children.filter((entry) => entry.isDirectory() || entry.name.endsWith('.mdx'))
          .map((entry) => entry.name.replace(/\.mdx$/u, ''));
        expect(meta.pages.slice().sort()).toEqual(expected.sort());
        for (const entry of children.filter((item) => item.isDirectory())) {
          expect(existsSync(join(directory, entry.name, 'meta.json'))).toBe(true);
          visit(join(directory, entry.name));
        }
      };
      visit(join(root, folder));
    });
  }
});
