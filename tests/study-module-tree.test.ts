import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docsRoot = join(process.cwd(), 'content', 'docs');
const expectedRootPages = ['math', '408', 'politics', 'english', 'programming'];
const expectedModuleChildren: Record<string, string[]> = {
  math: ['index', 'past-exams', 'exam', 'zhangyu-1000', 'lizhengyuan'],
  '408': ['index', 'mock', 'past-exams'],
  politics: [
    'index',
    ...Array.from({ length: 17 }, (_, index) => String(2010 + index)),
  ],
  english: ['index'],
  programming: ['index', 'algorithm'],
};

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

describe('documentation source structure', () => {
  it('uses only ASCII module roots so Fumadocs can resolve the active root from pathname', () => {
    const rootMeta = JSON.parse(readFileSync(join(docsRoot, 'meta.json'), 'utf8')) as {
      pages?: string[];
    };
    const rootDirectories = readdirSync(docsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(rootMeta.pages).toEqual(expectedRootPages);
    expect(rootDirectories.slice().sort()).toEqual(expectedRootPages.slice().sort());
    expect(rootDirectories.every((name) => /^[\x00-\x7F]+$/u.test(name))).toBe(true);
  });

  it('physically nests every collection inside its module root with no cross-root references', () => {
    for (const [moduleName, pages] of Object.entries(expectedModuleChildren)) {
      const meta = JSON.parse(
        readFileSync(join(docsRoot, moduleName, 'meta.json'), 'utf8'),
      ) as { root?: boolean; pages?: string[] };

      expect(meta.root).toBe(true);
      expect(meta.pages).toEqual(pages);
      expect(meta.pages?.some((page) => page.includes('..'))).toBe(false);
    }

    expect(readdirSync(join(docsRoot, 'math'))).toEqual(
      expect.arrayContaining(['past-exams', 'exam', 'zhangyu-1000', 'lizhengyuan']),
    );
    expect(readdirSync(join(docsRoot, '408'))).toEqual(
      expect.arrayContaining(['mock', 'past-exams']),
    );
    expect(readdirSync(join(docsRoot, 'programming'))).toContain('algorithm');
  });

  it('uses native Fumadocs root tabs instead of a custom tab routing layer', () => {
    const layout = readFileSync(join(process.cwd(), 'app', 'docs', 'layout.tsx'), 'utf8');

    expect(layout).not.toContain('study-modules');
    expect(layout).not.toMatch(/\btabs\s*=/u);
    expect(layout).toContain('tree={source.getPageTree()}');
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

  it('keeps politics exam years as direct documents without year subfolders', () => {
    const politicsRoot = join(docsRoot, 'politics');
    const entries = readdirSync(politicsRoot, { withFileTypes: true });
    const expectedYears = Array.from({ length: 17 }, (_, index) => String(2010 + index));
    const yearPages = entries
      .filter((entry) => entry.isFile() && /^\d{4}\.mdx$/u.test(entry.name))
      .map((entry) => entry.name.replace(/\.mdx$/u, ''))
      .sort();

    expect(yearPages).toEqual(expectedYears);
    expect(
      entries.filter((entry) => entry.isDirectory() && /^\d{4}$/u.test(entry.name)),
    ).toHaveLength(0);
  });
});
