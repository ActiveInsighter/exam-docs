import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

async function collectMdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMdxFiles(path)));
    } else if (entry.isFile() && path.endsWith('.mdx')) {
      files.push(path);
    }
  }

  return files;
}

describe('exam document formats', () => {
  it('escapes markdown control characters inside option text', async () => {
    const docsRoot = resolve(process.cwd(), 'content', 'docs');
    const mdxFiles = await collectMdxFiles(docsRoot);
    const invalidFiles: string[] = [];
    const literalMarkdownControlPattern =
      /<Option(?: correct)?>(?![^<]*\$)[^<]*(?:\*|~)[^<]*<\/Option>/u;

    for (const file of mdxFiles) {
      const source = await readFile(file, 'utf8');
      if (literalMarkdownControlPattern.test(source)) {
        invalidFiles.push(relative(process.cwd(), file));
      }
    }

    expect(invalidFiles).toEqual([]);
  });

  it('keeps multiline cases environments inside display math', async () => {
    const docsRoot = resolve(process.cwd(), 'content', 'docs');
    const mdxFiles = await collectMdxFiles(docsRoot);
    const invalidLocations: string[] = [];

    for (const file of mdxFiles) {
      const lines = (await readFile(file, 'utf8')).split(/\r?\n/u);
      let insideCodeFence = false;
      const displayDelimiterIndexes = lines.flatMap((line, index) =>
        line.match(/(?<!\\)\$\$/gu)?.length ? [index] : [],
      );

      for (const [index, line] of lines.entries()) {
        const trimmed = line.trim();
        if (/^(?:```|~~~)/u.test(trimmed)) {
          insideCodeFence = !insideCodeFence;
          continue;
        }
        if (insideCodeFence) continue;

        const hasInlineDelimiter = line
          .replace(/(?<!\\)\$\$/gu, '')
          .includes('$');
        const previousDisplayDelimiter = displayDelimiterIndexes
          .filter((delimiterIndex) => delimiterIndex < index)
          .at(-1);
        const nextDisplayDelimiter = displayDelimiterIndexes.find(
          (delimiterIndex) => delimiterIndex > index,
        );

        if (
          /\\begin\{cases\}/u.test(line) &&
          !hasInlineDelimiter &&
          (previousDisplayDelimiter === undefined ||
            nextDisplayDelimiter === undefined)
        ) {
          invalidLocations.push(`${relative(process.cwd(), file)}:${index + 1}`);
        }
      }
    }

    expect(invalidLocations).toEqual([]);
  });

  it('numbers the questions on each page consecutively from 1', async () => {
    const docsRoot = resolve(process.cwd(), 'content', 'docs');
    const mdxFiles = await collectMdxFiles(docsRoot);
    const invalidPages: string[] = [];

    for (const file of mdxFiles) {
      const lines = (await readFile(file, 'utf8')).split(/\r?\n/u);
      let insideCodeFence = false;
      let position = 0;
      const problems: string[] = [];

      for (const [index, line] of lines.entries()) {
        const trimmed = line.trim();
        if (/^(?:```|~~~)/u.test(trimmed)) {
          insideCodeFence = !insideCodeFence;
          continue;
        }
        if (insideCodeFence) continue;

        const question = /^\s*<Question\b([^>]*)>/u.exec(line);
        if (!question) continue;
        position += 1;

        const number = /\bnumber=\{([^}]*)\}|\bnumber=(?:"([^"]*)"|'([^']*)')/u.exec(question[1]);
        if (!number) continue;
        const raw = String(number[1] ?? number[2] ?? number[3]).trim();
        // `number={false}` hides the label; string labels ("例 1") are intentional.
        if (raw === 'false' || !/^-?\d+$/u.test(raw)) continue;
        if (Number(raw) !== position) {
          problems.push(`第 ${index + 1} 行显示 ${raw}，应为 ${position}`);
        }
      }

      if (problems.length > 0) invalidPages.push(`${relative(process.cwd(), file)}: ${problems.join('；')}`);
    }

    expect(invalidPages).toEqual([]);
  }, 60_000);

});
