import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { getQuestionProblems, type QuestionNode } from '@/lib/remark-question';

const docsRoot = resolve(process.cwd(), 'content', 'docs');
const parser = unified().use(remarkParse).use(remarkMdx).use(remarkMath);

async function collectFiles(directory: string, extension: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path, extension)));
    else if (entry.isFile() && path.endsWith(extension)) files.push(path);
  }
  return files;
}

function findQuestions(node: QuestionNode, out: QuestionNode[] = []) {
  if (node.type === 'mdxJsxFlowElement' && node.name === 'Question') out.push(node);
  for (const child of node.children ?? []) findQuestions(child, out);
  return out;
}

function attribute(node: QuestionNode, name: string) {
  const found = node.attributes?.find((item) => item.name === name);
  return typeof found?.value === 'string' ? found.value : null;
}

const LEGACY_TAG = /<Exam(?:Question|Solution|Answer|Explanation|Choices|Option)\b/u;
const COMPONENT_TAG = /<Question\b|<\/?Solution>|<Option(?: correct)?>|<Blank\b[^>]*\/>/u;

describe('question documents', () => {
  it('uses only the Question / Option / Blank / Solution components', async () => {
    const files = [
      ...(await collectFiles(docsRoot, '.mdx')),
      ...(await collectFiles(docsRoot, '.md')),
    ];
    const legacy: string[] = [];
    for (const file of files) {
      if (LEGACY_TAG.test(await readFile(file, 'utf8'))) legacy.push(relative(process.cwd(), file));
    }
    expect(legacy).toEqual([]);
  });

  it('keeps component-backed documents in MDX files', async () => {
    const invalid: string[] = [];
    for (const file of await collectFiles(docsRoot, '.md')) {
      if (COMPONENT_TAG.test(await readFile(file, 'utf8'))) invalid.push(relative(process.cwd(), file));
    }
    expect(invalid).toEqual([]);
  });

  it('has structurally valid questions with globally unique ids', async () => {
    const problems: string[] = [];
    const ids = new Map<string, string>();
    let total = 0;

    for (const file of await collectFiles(docsRoot, '.mdx')) {
      const source = await readFile(file, 'utf8');
      if (!/<Question\b/u.test(source)) continue;
      const page = relative(process.cwd(), file);
      const tree = parser.parse(source) as QuestionNode;

      for (const problem of getQuestionProblems(tree)) {
        problems.push(`${page}:${problem.line ?? '?'} ${problem.message}`);
      }

      for (const question of findQuestions(tree)) {
        total += 1;
        const id = attribute(question, 'id');
        if (!id) continue;
        const previous = ids.get(id);
        if (previous) problems.push(`${page}: id "${id}" 与 ${previous} 重复`);
        ids.set(id, page);

        // Every graded or essay question carries its reference solution,
        // except choice questions that only declare the key.
        const type = attribute(question, 'type');
        const hasSolution = question.children?.some(
          (child) => child.type === 'mdxJsxFlowElement' && child.name === 'Solution',
        );
        if (type === 'essay' && !hasSolution) {
          problems.push(`${page}:${question.position?.start.line} [${id}] 解答题缺少 Solution`);
        }
      }
    }

    expect(total).toBeGreaterThan(9000);
    expect(problems).toEqual([]);
  }, 120_000);
});
