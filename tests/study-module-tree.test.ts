import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docsRoot = join(process.cwd(), 'content', 'docs');
const expectedRootPages = ['math', '408', 'politics', 'programming'];
const expectedModuleChildren: Record<string, string[]> = {
  math: ['index', 'past-exams', 'core-questions', 'exam', 'classified-mock-exams'],
  '408': ['index', 'mock', '王道八套卷', 'past-exams', 'past-exams-large-questions', '408历年真题'],
  politics: ['index', 'historical-questions', 'classified-questions', 'xiao8'],
  programming: ['index', 'algorithm'],
};

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

describe('documentation source structure', () => {
  it('extracts 112 essay questions from past-exams into past-exams-large-questions under the same 24 chapters', () => {
    const referenceRoot = join(docsRoot, '408', 'past-exams');
    const collectionRoot = join(docsRoot, '408', 'past-exams-large-questions');
    const subjects = ['01-数据结构', '02-计算机组成原理', '03-操作系统', '04-计算机网络'];
    let chapterCount = 0;

    for (const [subjectIndex, subject] of subjects.entries()) {
      const chapterFiles = readdirSync(join(referenceRoot, subject))
        .filter((name) => name.endsWith('.mdx')).sort();
      const directory = join(collectionRoot, subject);
      const meta = JSON.parse(readFileSync(join(directory, 'meta.json'), 'utf8'));
      expect(meta.pages).toEqual(['index', ...chapterFiles.map((name) => name.slice(0, -4))]);
      expect(readdirSync(directory).filter((name) => name.endsWith('.mdx')).sort())
        .toEqual([...chapterFiles, 'index.mdx'].sort());

      let subjectCount = 0;
      for (const name of chapterFiles) {
        const content = readFileSync(join(directory, name), 'utf8');
        const reference = readFileSync(join(referenceRoot, subject, name), 'utf8');
        expect(content.match(/^title: .+$/mu)?.[0]).toBe(reference.match(/^title: .+$/mu)?.[0]);
        expect(reference).not.toMatch(/type="essay"/u);

        const qOpenCount = content.match(/<Question\b/gu)?.length ?? 0;
        const qCloseCount = content.match(/<\/Question>/gu)?.length ?? 0;
        const solOpenCount = content.match(/<Solution>/gu)?.length ?? 0;
        const solCloseCount = content.match(/<\/Solution>/gu)?.length ?? 0;
        expect(Number(content.match(/^questionCount: (\d+)$/mu)?.[1])).toBe(qOpenCount);
        expect(qCloseCount).toBe(qOpenCount);
        expect(solOpenCount).toBe(qOpenCount);
        expect(solCloseCount).toBe(qOpenCount);
        for (const tag of content.match(/<Question\b[^>]*>/gu) ?? []) {
          expect(tag).toMatch(/type="essay"/u);
          expect(tag).toMatch(/tags="来源:\d{4}考研408"/u);
        }

        subjectCount += qOpenCount;
        chapterCount += 1;
      }
      expect(subjectCount).toBe(subjectIndex === 3 ? 16 : 32);
    }
    expect(chapterCount).toBe(24);
  });

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
      expect.arrayContaining([
        'past-exams',
        'exam',
      ]),
    );
    expect(readdirSync(join(docsRoot, '408'))).toEqual(
      expect.arrayContaining(['mock', 'past-exams', 'past-exams-large-questions']),
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

  it('groups politics exam years and classified chapters in their own collections', () => {
    const politicsRoot = join(docsRoot, 'politics');
    const entries = readdirSync(politicsRoot, { withFileTypes: true });
    const historicalRoot = join(politicsRoot, 'historical-questions');
    const historicalMeta = JSON.parse(
      readFileSync(join(historicalRoot, 'meta.json'), 'utf8'),
    ) as { pages?: string[] };
    const expectedYears = Array.from({ length: 17 }, (_, index) => String(2010 + index));
    const yearPages = readdirSync(historicalRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^\d{4}\.mdx$/u.test(entry.name))
      .map((entry) => entry.name.replace(/\.mdx$/u, ''))
      .sort();

    expect(yearPages).toEqual(expectedYears);
    expect(historicalMeta.pages).toEqual(['index', ...expectedYears]);
    expect(
      entries.filter((entry) => entry.isFile() && /^\d{4}\.mdx$/u.test(entry.name)),
    ).toHaveLength(0);
    expect(
      entries.filter((entry) => entry.isDirectory() && /^\d{4}$/u.test(entry.name)),
    ).toHaveLength(0);

    const classifiedRoot = join(politicsRoot, 'classified-questions');
    const classifiedMeta = JSON.parse(
      readFileSync(join(classifiedRoot, 'meta.json'), 'utf8'),
    ) as { pages?: string[] };
    const expectedModules = [
      'marxism-principles',
      'mao-zedong-thought',
      'xi-jinping-thought',
      'modern-chinese-history',
      'ideology-morality-law',
    ];

    expect(classifiedMeta.pages).toEqual(['index', ...expectedModules]);
    expect(
      readdirSync(classifiedRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(expectedModules.slice().sort());
  });
});
