import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getShortDocSlugPath } from '../scripts/doc-paths.mjs';

const docsRoot = join(process.cwd(), 'content', 'docs');

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

describe('study module route matching', () => {
  it('generates ASCII-only routes for every documentation page', () => {
    const routes = walkFiles(docsRoot)
      .filter((filePath) => /\.(md|mdx)$/u.test(filePath))
      .map((filePath) => getShortDocSlugPath(relative(docsRoot, filePath)));

    expect(routes.every((route) => /^[\x00-\x7F]*$/u.test(route))).toBe(true);
  });

  it('keeps module and collection entry routes readable and nested', () => {
    expect(getShortDocSlugPath('math/index.mdx')).toBe('math');
    expect(getShortDocSlugPath('math/past-exams/index.md')).toBe('math/past-exams');
    expect(getShortDocSlugPath('408/mock/index.md')).toBe('408/mock');
    expect(getShortDocSlugPath('408/past-exams/index.md')).toBe('408/past-exams');
    expect(getShortDocSlugPath('politics/2010.mdx')).toBe('politics/2010');
    expect(getShortDocSlugPath('programming/algorithm/index.md')).toBe(
      'programming/algorithm',
    );
  });

  it('compacts an unsafe first segment instead of exposing a Unicode root URL', () => {
    const slug = getShortDocSlugPath('数学/index.mdx');

    expect(slug).toMatch(/^s-[0-9a-f]{8}$/u);
    expect(slug).not.toContain('数学');
  });
});
