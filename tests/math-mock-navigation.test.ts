import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { getShortDocSlugPath } from '../lib/doc-paths.mjs';

const docsRoot = join(process.cwd(), 'content/docs');
function documents(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? documents(file) : /\.mdx?$/u.test(file) ? [file] : [];
  });
}

describe('math mock paper navigation', () => {
  it('links to published routes, including compact Chinese paths and preserved 1028 URLs', () => {
    const routes = new Set(documents(docsRoot).map((file) => `/docs/${getShortDocSlugPath(relative(docsRoot, file))}`));
    const pages = [
      ...documents(join(docsRoot, 'math/classified-mock-exams')),
      ...documents(join(docsRoot, 'math/exam/zhangyu-8-sets-2027')),
      ...documents(join(docsRoot, 'math/exam/lilin-6-sets-2027')),
      ...documents(join(docsRoot, 'math/exam/liyongle-6-sets-2027')),
      ...documents(join(docsRoot, 'math/exam/tangjiafeng-8-sets-2027')),
      join(docsRoot, 'math/exam/index.mdx'),
      join(docsRoot, 'math/exam/数学模拟题1028/index.mdx'),
    ];
    const broken: string[] = [];
    const parser = unified().use(remarkParse).use(remarkMdx).use(remarkMath);
    for (const file of pages) {
      visit(parser.parse(readFileSync(file, 'utf8')), 'link', (node) => {
        const href = node.url.split('#')[0];
        if (href.startsWith('http') || !href) return;
        const valid = href.startsWith('/docs/')
          ? routes.has(href.replace(/\/$/u, ''))
          : href.startsWith('/') && existsSync(join(process.cwd(), 'public', href));
        if (!valid) broken.push(`${relative(docsRoot, file)}: ${href}`);
      });
    }
    expect(broken).toEqual([]);
  }, 30_000);
});
