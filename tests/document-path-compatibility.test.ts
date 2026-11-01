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
    expect(getShortDocSlugPath('math/past-exams/index.mdx')).toBe('math/past-exams');
  });

  it('preserves published mock paper URLs after grouping by series', () => {
    for (const [folder, prefix, count] of [
      ['lilin-6-sets-2027', 'lilin', 6],
      ['liyongle-6-sets-2027', 'liyongle', 6],
      ['tangjiafeng-8-sets-2027', 'tangjiafeng', 8],
    ] as const) {
      expect(getShortDocSlugPath(`math/exam/${folder}/index.mdx`)).toBe(`math/exam/${folder}`);
      for (let number = 1; number <= count; number += 1) {
        const padded = String(number).padStart(2, '0');
        expect(getShortDocSlugPath(`math/exam/${folder}/${padded}-卷一.mdx`)).toBe(
          getShortDocSlugPath(`math/exam/数学模拟题1028/${prefix}-${padded}.mdx`),
        );
      }
    }
  });
});
