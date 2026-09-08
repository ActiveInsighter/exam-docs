import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docsRoot = join(process.cwd(), 'content', 'docs');

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

describe('imported document metadata', () => {
  it('maps every Docusaurus category file to a Fumadocs meta file', () => {
    const categoryFiles = walkFiles(docsRoot).filter((filePath) =>
      filePath.endsWith('_category_.json'),
    );

    expect(categoryFiles.length).toBeGreaterThan(0);

    for (const categoryFile of categoryFiles) {
      const metaFile = join(dirname(categoryFile), 'meta.json');
      const category = JSON.parse(readFileSync(categoryFile, 'utf8')) as {
        label?: string;
      };
      const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as {
        title?: string;
      };

      expect(meta.title).toBe(category.label);
    }
  });
});
