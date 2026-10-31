import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import { fixStrongEmphasis, flanking } from '@/lib/markdown-emphasis.mjs';

/*
 * `**…**` whose content ends (or starts) with punctuation only parses when
 * the character outside is whitespace or punctuation too, so
 * "**解题过程：**由独立性知" is shown with its asterisks. Every document is
 * parsed the way MDX parses it, and any `**` left in plain text fails the
 * run, which blocks the deploy workflow. Repair with
 * `node scripts/fix-strong-emphasis.mjs`.
 */

const processor = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).use(remarkMath);

async function collectDocuments(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectDocuments(path)));
    else if (/\.mdx?$/u.test(entry.name)) files.push(path);
  }
  return files;
}

/** `**` that survived parsing as plain text, with the line it is on. */
function literalStrongMarkers(source: string) {
  const found: { line: number; text: string }[] = [];
  visit(processor.parse(source), 'text', (node) => {
    if (!node.value.includes('**')) return;
    const at = node.value.indexOf('**');
    found.push({
      line: node.position?.start.line ?? 0,
      text: node.value.slice(Math.max(0, at - 16), at + 24).replace(/\s+/gu, ' '),
    });
  });
  return found;
}

describe('strong emphasis in documents', () => {
  it('leaves no unparsed ** in any document', async () => {
    const root = resolve(process.cwd(), 'content');
    const problems: string[] = [];
    for (const file of await collectDocuments(root)) {
      for (const marker of literalStrongMarkers(await readFile(file, 'utf8'))) {
        problems.push(`${relative(process.cwd(), file)}:${marker.line}  …${marker.text}…`);
      }
    }
    expect(problems, 'Run `node scripts/fix-strong-emphasis.mjs` and review the diff.').toEqual([]);
  }, 180_000);
});

describe('literalStrongMarkers', () => {
  it('flags the CommonMark cases that render asterisks', () => {
    expect(literalStrongMarkers('**解题过程：**由独立性知')).toHaveLength(1);
    expect(literalStrongMarkers('它是**“关键”**的')).toHaveLength(1);
    expect(literalStrongMarkers('答案为 ** 3**。')).toHaveLength(1);
    expect(literalStrongMarkers('**答案：**$x$，**解题过程**：由此')).toEqual([]);
    expect(literalStrongMarkers('`a**b`、$a^{**}$')).toEqual([]);
  });
});

describe('flanking', () => {
  it('follows the CommonMark delimiter rules', () => {
    expect(flanking('：', '由')).toEqual({ open: true, close: false });
    expect(flanking('：', '')).toMatchObject({ close: true });
    expect(flanking('：', '$')).toMatchObject({ close: true });
    expect(flanking('是', '“')).toMatchObject({ open: false });
    expect(flanking('', '“')).toMatchObject({ open: true });
  });
});

describe('fixStrongEmphasis', () => {
  const fix = (source: string) => fixStrongEmphasis(source).text;

  it('moves trailing sentence punctuation out of the run', () => {
    expect(fix('**解题过程：**由独立性知')).toBe('**解题过程**：由独立性知');
    expect(fix('- **B：**取 $A=I$')).toBe('- **B**：取 $A=I$');
    expect(fix('**为什么？**因为')).toBe('**为什么**？因为');
  });

  it('moves a pair of quotes out together', () => {
    expect(fix('它是**“关键”**的')).toBe('它是“**关键**”的');
  });

  it('falls back to <strong> when nothing can move', () => {
    expect(fix('取**LSB（最低位）**位')).toBe('取<strong>LSB（最低位）</strong>位');
    expect(fix('为**$0x06F$**的')).toBe('为<strong>$0x06F$</strong>的');
  });

  it('drops spaces just inside the markers', () => {
    expect(fix('答案为 ** 3**。')).toBe('答案为 **3**。');
  });

  it('keeps runs that already parse and skips code and maths', () => {
    const untouched = [
      '**答案：**$x$。',
      '**答案**：由此',
      '```\n**a：**b\n```',
      '$$\n**a：**b\n$$',
      '`**a：**b`',
    ];
    for (const source of untouched) expect(fix(source)).toBe(source);
  });

  it('repairs every case so that it parses', () => {
    const samples = ['**解题过程：**由', '它是**“关键”**的', '取**LSB（最低位）**位', '为**$x$**的', '**A：**甲，**B：**乙'];
    for (const sample of samples) expect(literalStrongMarkers(fix(sample))).toEqual([]);
  });
});
