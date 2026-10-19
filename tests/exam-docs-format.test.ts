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

});
