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

describe('documentation route paths', () => {
  it('keeps every document route short and unique on Windows', () => {
    const sourcePaths = walkFiles(docsRoot)
      .filter((filePath) => /\.(md|mdx)$/u.test(filePath))
      .map((filePath) => relative(docsRoot, filePath));
    const slugs = sourcePaths.map(getShortDocSlugPath);

    expect(Math.max(...slugs.map((slug) => slug.length))).toBeLessThanOrEqual(150);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps short source paths readable', () => {
    expect(getShortDocSlugPath('intro.mdx')).toBe('intro');
    expect(getShortDocSlugPath('数学真题/index.mdx')).toBe(encodeURI('数学真题'));
  });
});
