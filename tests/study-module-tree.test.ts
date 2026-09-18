import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docsRoot = join(process.cwd(), 'content', 'docs');
const expectedRootPages = [
  '数学',
  '408',
  '政治',
  '英语',
  '编程',
].sort();

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

describe('documentation source structure', () => {
  it('declares every imported top-level collection in the Fumadocs root metadata', () => {
    const rootMeta = JSON.parse(readFileSync(join(docsRoot, 'meta.json'), 'utf8')) as {
      pages?: string[];
    };

    expect(rootMeta.pages?.slice().sort()).toEqual(expectedRootPages);
  });

  it('gives every Markdown page a title and no longer imports Docusaurus-only components', () => {
    const pages = walkFiles(docsRoot).filter((filePath) => /\.(md|mdx)$/u.test(filePath));

    for (const filePath of pages) {
      const content = readFileSync(filePath, 'utf8');
      const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
      expect(frontmatter).toContain('title:');
      expect(content).not.toMatch(/@theme\/(?:Tabs|TabItem)|<TabItem\b/u);
    }
  }, 30_000);
});
