import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFormulaErrors } from './helpers/formula-errors';

function pagesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pagesIn(path) : path.endsWith('.mdx') ? [path] : [];
  });
}

describe('fill-in question formulas', () => {
  it('keeps interactive fields outside valid KaTeX formulas', () => {
    const errors: string[] = [];
    let total = 0;
    for (const path of pagesIn(join(process.cwd(), 'content/docs'))) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/<Question\b[^>]*type="blank"[^>]*>[\s\S]*?<\/Question>/gu)) {
        total++;
        try {
          for (const error of findFormulaErrors(match[0])) errors.push(`${relative(process.cwd(), path)}: ${error}`);
        } catch (error) {
          errors.push(`${relative(process.cwd(), path)}: ${String(error)}`);
        }
      }
    }
    expect(total).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  }, 60_000);
});
