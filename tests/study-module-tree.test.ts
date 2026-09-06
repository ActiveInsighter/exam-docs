import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docsRoot = join(process.cwd(), 'content', 'docs');

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('study module metadata structure', () => {
  const rootMeta = readJson(join(docsRoot, 'meta.json'));
  const mathMeta = readJson(join(docsRoot, 'math', 'meta.json'));
  const examMathMeta = readJson(join(docsRoot, 'math', 'exam-math', 'meta.json'));
  const politicsMeta = readJson(join(docsRoot, 'politics', 'meta.json'));
  const examPoliticsMeta = readJson(join(docsRoot, 'politics', 'exam-politics', 'meta.json'));
  const coursesMeta = readJson(join(docsRoot, '408', 'meta.json'));
  const exam408Meta = readJson(join(docsRoot, '408', 'exam-408', 'meta.json'));

  it('exposes exactly four root modules from the documentation root', () => {
    expect(rootMeta.pages).toEqual(['politics', 'english', 'math', '408']);

    const rootDirectories = readdirSync(docsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(rootDirectories).toEqual(
      ['408', 'english', 'math', 'math-question-types', 'politics'].sort(),
    );
  });

  it('groups the math subjects under the exam-math folder', () => {
    expect(mathMeta.root).toBe(true);
    expect(mathMeta.pages).toEqual([
      'index',
      'exam-math',
    ]);
    expect(examMathMeta.title).toBe('考研数学');
    expect(examMathMeta.pages).toEqual([
      'index',
      '../advanced-mathematics',
      '../linear-algebra',
      '../probability-statistics',
      '../../math-question-types',
    ]);
  });

  it('groups politics and 408 subjects under their module folders', () => {
    expect(politicsMeta.pages).toEqual(['index', 'exam-politics']);
    expect(examPoliticsMeta.title).toBe('考研政治系统讲义');
    expect(examPoliticsMeta.pages).toEqual([
      'index',
      '../marxism-principles',
      '../mao-zedong-thought',
      '../modern-chinese-history',
      '../xi-jinping-thought',
      '../ideology-morality-law',
    ]);

    expect(coursesMeta.pages).toEqual(['index', 'exam-408']);
    expect(exam408Meta.title).toBe('408 计算机统考');
    expect(exam408Meta.pages).toEqual([
      'index',
      '../data-structures',
      '../computer-organization',
      '../operating-systems',
      '../computer-networks',
      '../problem-solving-techniques',
    ]);
  });

  it('keeps math-question-types itself as a normal nested folder, not another root module', () => {
    const questionTypesMeta = readJson(join(docsRoot, 'math-question-types', 'meta.json'));
    expect(questionTypesMeta.root).not.toBe(true);
    expect(questionTypesMeta.title).toBe('数学真题题型总结');
  });
});
