import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const supplementsRoot = join(process.cwd(), 'content', 'docs', 'math', 'supplements');

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as { pages?: string[] };
}

describe('math supplements structure', () => {
  const expected = {
    'advanced-mathematics': [
      '01-function-foundations',
      '02-calculus-overview',
      '03-limits-continuity',
      '04-derivatives-differentials',
      '05-integration',
      '06-taylor-fourier-expansions',
      '07-differential-equations',
      '08-infinite-series',
    ],
    'linear-algebra': [
      '01-linear-algebra-overview',
      '02-vectors',
      '03-matrices',
      '04-special-matrices',
      '05-linear-transformations',
      '06-eigenvalues-eigenvectors-diagonalization',
      '07-quadratic-forms',
    ],
    'probability-statistics': ['01-overview', '02-concept-chain'],
  } as const;

  it('uses subject-first semantic navigation instead of task/message ids', () => {
    expect(readJson(join(supplementsRoot, 'meta.json')).pages).toEqual([
      'index',
      'advanced-mathematics',
      'linear-algebra',
      'probability-statistics',
    ]);

    for (const [subject, pages] of Object.entries(expected)) {
      const subjectRoot = join(supplementsRoot, subject);
      expect(readJson(join(subjectRoot, 'meta.json')).pages).toEqual(['index', ...pages]);

      const files = readdirSync(subjectRoot)
        .filter((name) => name.endsWith('.mdx') && name !== 'index.mdx')
        .map((name) => name.replace(/\.mdx$/u, ''))
        .sort();
      expect(files).toEqual([...pages].sort());

      for (const page of pages) {
        const content = readFileSync(join(subjectRoot, `${page}.mdx`), 'utf8');
        expect(content).toMatch(/^---\ntitle: /u);
        expect(content).toMatch(/\ndescription: /u);
      }
    }
  });
});
