import { describe, expect, it } from 'vitest';
import {
  buildSourceTree, countQuestionsInMdx, indexSources, normalizeDocPath, resolveSource, sourceTrail, type PageTreeLike,
} from '../lib/doc-sources';
import { buildCoverage, collectActivity, collectRecords, dayKey, groupSessions, pagesOf, streakOf, totalsOf } from '../lib/question-records';
import type { AnswerState } from '../lib/question-store/types';

const pageTree: PageTreeLike = {
  name: 'root',
  children: [
    {
      type: 'folder', name: '数学', root: true,
      index: { name: '数学', url: '/docs/math' },
      children: [
        {
          type: 'folder', name: '数学真题',
          children: [
            { type: 'page', name: '2020 年', url: '/docs/math/past/2020/' },
            { type: 'page', name: '2021 年', url: '/docs/math/past/2021' },
          ],
        },
      ],
    },
    { type: 'folder', name: '408', root: true, children: [{ type: 'page', name: '第1章 绪论', url: '/docs/408/%E7%AC%AC1%E7%AB%A0' }] },
    { type: 'page', name: '题型示例', url: '/docs/question-types' },
    { type: 'page', name: '外链', url: 'https://example.com', external: true },
  ],
};

const counts: Record<string, number> = { '/docs/math/past/2020': 10, '/docs/math/past/2021': 5, '/docs/408/第1章': 4, '/docs/question-types': 3 };
const tree = buildSourceTree(pageTree, (url) => counts[url] ?? 0);
const index = indexSources(tree);

const state = (selected: string[], submitted = false): AnswerState => ({ selected, values: [], submitted, attempt: submitted ? 1 : 0 });

describe('doc sources', () => {
  it('turns the sidebar into modules with question counts', () => {
    expect(tree.modules.map((module) => [module.name, module.questions])).toEqual([['数学', 15], ['408', 4], ['其他', 3]]);
  });

  it('resolves stored paths, encoded or with a trailing slash, to module, folders and page', () => {
    expect(resolveSource(index, '/docs/math/past/2020/')).toMatchObject({ module: '数学', folders: ['数学真题'], page: '2020 年', known: true });
    expect(resolveSource(index, '/docs/408/第1章')).toMatchObject({ module: '408', folders: [], page: '第1章 绪论' });
    expect(resolveSource(index, '/docs/408/%E7%AC%AC1%E7%AB%A0')).toMatchObject({ page: '第1章 绪论' });
    expect(sourceTrail(resolveSource(index, '/docs/math/past/2021'))).toBe('数学 › 数学真题');
  });

  it('labels pages that left the sidebar from their path', () => {
    expect(resolveSource(index, '/docs/math/old/chapter-1')).toEqual({ module: '其他', folders: ['math', 'old'], page: 'chapter-1', url: '/docs/math/old/chapter-1', known: false });
    expect(resolveSource(null, '/docs/math/past/2020')).toMatchObject({ known: false, page: '2020' });
  });

  it('normalises paths', () => {
    expect(normalizeDocPath('/docs/a/b/?x=1#question-1')).toBe('/docs/a/b');
    expect(normalizeDocPath('/')).toBe('/');
  });

  it('counts question tags but not examples inside code fences', () => {
    const mdx = '<Question id="a" type="single">\n</Question>\n\n```mdx\n<Question id="b" type="single">\n```\n\n  <Question type="essay" id="c">\n';
    expect(countQuestionsInMdx(mdx)).toBe(2);
  });
});

describe('question records', () => {
  const answers = [
    { documentPath: '/docs/math/past/2020', questionId: 'q1', state: state(['A'], true), updatedAt: '2026-11-01T10:00:00.000Z' },
    // A newer revision of q1 overrides the older one.
    { documentPath: '/docs/math/past/2020', questionId: 'q1', state: state(['B']), updatedAt: '2026-11-02T10:00:00.000Z' },
    { documentPath: '/docs/math/past/2020/', questionId: 'q2', state: state(['C'], true), updatedAt: '2026-11-02T09:00:00.000Z' },
    { documentPath: '/docs/408/第1章', questionId: 'x', state: state([]), updatedAt: '2026-11-03T09:00:00.000Z' },
    { documentPath: '/docs/math/gone', questionId: 'g', state: state(['A']), updatedAt: '2026-10-01T09:00:00.000Z' },
  ];
  const attempts = [
    { documentPath: '/docs/math/past/2020', questionId: 'q1', createdAt: '2026-11-01T10:00:00.000Z' },
    { documentPath: '/docs/math/past/2020', questionId: 'q2', createdAt: '2026-11-02T09:00:00.000Z' },
  ];
  const records = collectRecords(answers, attempts);

  it('keeps one record per question, newest first, and drops untouched questions', () => {
    expect(records.map((record) => [record.documentPath, record.questionId, record.answered, record.submitted, record.attempts])).toEqual([
      ['/docs/math/past/2020', 'q1', true, false, 1],
      ['/docs/math/past/2020', 'q2', true, true, 1],
      ['/docs/math/gone', 'g', true, false, 0],
    ]);
    expect(totalsOf(records)).toEqual({ answered: 3, submitted: 1, attempts: 2, pages: 2, lastAt: '2026-11-02T10:00:00.000Z' });
  });

  it('annotates the sidebar and collects pages that left it', () => {
    const coverage = buildCoverage(tree, records, index);
    expect(coverage.map((module) => [module.name, module.totals.answered, module.questions])).toEqual([
      ['数学', 2, 15], ['408', 0, 4], ['其他', 1, 4],
    ]);
    const math = coverage[0];
    expect(pagesOf(math).map((page) => [page.name, page.totals.answered])).toEqual([['2020 年', 2], ['2021 年', 0]]);
    expect(pagesOf(coverage[2]).map((page) => page.name)).toContain('math / gone');
  });

  it('groups consecutive answers on one page into a session', () => {
    const sessions = groupSessions(records, (record) => record.lastAt.slice(0, 10));
    expect(sessions.map((session) => [session.group, session.documentPath, session.records.length])).toEqual([
      ['2026-11-02', '/docs/math/past/2020', 2],
      ['2026-10-01', '/docs/math/gone', 1],
    ]);
  });
});

describe('activity', () => {
  const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

  it('counts distinct questions per local day from submissions and current answers', () => {
    const activity = collectActivity(
      [
        { documentPath: '/docs/a', questionId: 'q1', state: state(['A'], true), updatedAt: local(2026, 11, 2) },
        { documentPath: '/docs/a', questionId: 'q2', state: state(['B']), updatedAt: local(2026, 11, 3) },
        // An empty (reset) answer is not activity.
        { documentPath: '/docs/a', questionId: 'q3', state: state([]), updatedAt: local(2026, 11, 3) },
      ],
      [
        { documentPath: '/docs/a', questionId: 'q1', createdAt: local(2026, 11, 1) },
        { documentPath: '/docs/a', questionId: 'q1', createdAt: local(2026, 11, 2, 9) },
        { documentPath: '/docs/a/', questionId: 'q1', createdAt: local(2026, 11, 2, 10) },
      ],
    );
    expect(Object.fromEntries(activity)).toEqual({ '2026-11-01': 1, '2026-11-02': 1, '2026-11-03': 1 });
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('measures the streak up to today, or up to yesterday while today is empty', () => {
    const activity = new Map([['2026-11-01', 2], ['2026-11-02', 5], ['2026-11-03', 1], ['2026-10-30', 4]]);
    expect(streakOf(activity, new Date(2026, 10, 3, 20))).toBe(3);
    expect(streakOf(activity, new Date(2026, 10, 4, 8))).toBe(3);
    expect(streakOf(activity, new Date(2026, 10, 5, 8))).toBe(0);
  });
});
