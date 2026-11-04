import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { remarkQuestion, type QuestionNode } from '../lib/remark-question';

const docsRoot = join(process.cwd(), 'content/docs');
const parser = unified().use(remarkParse).use(remarkMdx).use(remarkMath).use(remarkGfm);

function pagesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? pagesIn(file) : file.endsWith('.mdx') ? [file] : [];
  });
}

function questionsIn(node: QuestionNode): QuestionNode[] {
  if (node.name === 'Question') return [node];
  return (node.children ?? []).flatMap(questionsIn);
}

describe('reorganized math collection numbering', () => {
  for (const [collection, total] of [['classified-mock-exams', 1744], ['core-questions', 1425]] as const) {
    it(`shows every question once, numbered from 1 on each ${collection} page`, () => {
      const problems: string[] = [];
      let questionCount = 0;
      for (const file of pagesIn(join(docsRoot, 'math', collection))) {
        const source = readFileSync(file, 'utf8');
        if (!source.includes('<Question')) continue;
        const tree = parser.parse(source) as QuestionNode;
        remarkQuestion()(tree, { path: file, value: source });
        const questions = questionsIn(tree);
        questionCount += questions.length;
        questions.forEach((question, index) => {
          // Question gives the authored number precedence over the compiled index.
          const explicit = question.attributes?.find((attribute) => attribute.name === 'number');
          const compiled = question.attributes?.find((attribute) => attribute.name === 'index');
          const value = (explicit ?? compiled)?.value;
          const label = typeof value === 'string' ? value : value?.value;
          if (label !== String(index + 1)) {
            problems.push(`${relative(docsRoot, file)}: question ${index + 1} displays ${label ?? 'no number'}`);
          }
        });
      }
      expect(questionCount).toBe(total);
      expect(problems).toEqual([]);
    }, 60_000);
  }
});
