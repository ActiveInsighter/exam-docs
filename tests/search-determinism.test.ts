import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Static search helpers are intentionally Node.js ESM scripts.
import { canonicalizeZBSearchDatabase } from '../scripts/canonicalize-zbsearch.mjs';

describe('static search determinism', () => {
  it('preserves Fumadocs result ordering and releases ownership between clients', async () => {
    const { exportSimpleIndex } = await import('../scripts/zbsearch-index.mjs');
    const { staticClient } = await import('fumadocs-core/search/client/orama-static');
    const { createSearchTokenizer } = await import('../lib/search-tokenizer.mjs');
    const { create } = await import('zbsearch');
    const { createStaticSearchClient } = await import('../lib/static-search.mjs');
    const raw = await exportSimpleIndex([
      { title: '特征值与矩阵', content: '矩阵相似对角化与特征向量', url: '/docs/eigen#matrix', breadcrumbs: ['数学'] },
      { title: 'CPU pipeline', content: 'Instruction pipeline', url: '/docs/pipeline' },
      { title: '特征值', content: '矩阵与特征值', url: '/docs/eigen' },
    ]);
    const fetcher = vi.fn(async () => new Response(raw));
    vi.stubGlobal('fetch', fetcher);
    const own = createStaticSearchClient('/search/owned.json', 10);
    for (const query of ['特征值', 'pipline', 'unknown']) {
      const baseline = staticClient({ from: '/search/baseline.json',
        initDB: () => create({ schema: { _: 'string' }, components: { tokenizer: createSearchTokenizer() } }),
        search: { limit: 10, ...(/\p{Script=Han}/u.test(query) ? { tolerance: 0, threshold: 0 } : {}) } });
      expect(await own.search(query)).toEqual(await baseline.search(query));
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    await createStaticSearchClient('/search/owned.json', 10).search('特征值');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('retries a failed index fetch instead of caching the rejection forever', async () => {
    const { exportSimpleIndex } = await import('../scripts/zbsearch-index.mjs');
    const raw = await exportSimpleIndex([{ title: '矩阵', content: '矩阵', url: '/docs/matrix' }]);
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockImplementation(async () => new Response(raw));
    vi.stubGlobal('fetch', fetcher);
    const { createStaticSearchClient } = await import('../lib/static-search.mjs');
    const client = createStaticSearchClient('/search/retry.json', 10);
    await expect(client.search('矩阵')).rejects.toThrow('503');
    expect((await client.search('矩阵'))[0].url).toBe('/docs/matrix');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('finds a Chinese title when browser and build ICU dictionaries differ', async () => {
    let browserRuntime = false;
    const nativeSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    const runtimeIntl = Object.create(Intl);
    runtimeIntl.Segmenter = class {
      segment(input: string) {
        // Node and browser ICU versions can disagree on the same Chinese phrase.
        if (input === '考研核心题目') {
          return (browserRuntime ? ['考', '研', '核心', '题目'] : ['考研', '核心', '题目'])
            .map((segment) => ({ segment, isWordLike: true }));
        }
        return nativeSegmenter.segment(input);
      }
    };
    vi.stubGlobal('Intl', runtimeIntl);
    const { exportSimpleIndex } = await import('../scripts/zbsearch-index.mjs');
    const raw = await exportSimpleIndex([
      { title: '考研核心题目', url: '/docs/math/core-questions', content: '考研核心题目' },
      { title: '二叉树的遍历', url: '/docs/408/trees', content: '遍历二叉树' },
      { title: '质心及形心', url: '/docs/math/centroid', content: '质心及形心' },
    ]);
    const database = JSON.parse(canonicalizeZBSearchDatabase(raw));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(database))));
    browserRuntime = true;
    const { createStaticSearchClient } = await import('../lib/static-search.mjs');
    const results = await createStaticSearchClient('/search/icu-regression.json', 10)
      .search('考研核心题目');
    expect(results.map((result) => result.url)).toEqual(['/docs/math/core-questions']);
  });

  it('supports mixed Chinese/numbers and Latin typos without Intl.Segmenter', async () => {
    const runtimeIntl = Object.create(Intl);
    runtimeIntl.Segmenter = undefined;
    vi.stubGlobal('Intl', runtimeIntl);
    const { exportSimpleIndex } = await import('../scripts/zbsearch-index.mjs');
    const raw = await exportSimpleIndex([
      { title: '1009线性代数核心题目', url: '/docs/math/linear', content: '线性代数' },
      { title: 'CPU pipeline', url: '/docs/408/pipeline', content: 'Instruction pipeline' },
      { title: '二叉树遍历', url: '/docs/408/trees', content: '二叉树遍历' },
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(canonicalizeZBSearchDatabase(raw))));
    const { createStaticSearchClient } = await import('../lib/static-search.mjs');
    const client = createStaticSearchClient('/search/no-segmenter-regression.json', 10);
    for (const query of ['１００９线性代数', '核心题目', '线']) {
      expect((await client.search(query)).map((result) => result.url), query)
        .toEqual(['/docs/math/linear']);
    }
    expect((await client.search('pipline')).map((result) => result.url))
      .toEqual(['/docs/408/pipeline']);
  });

  it('removes autogenerated external document-id entropy without touching search data', () => {
    const shared = {
      type: 'simple',
      language: 'multilingual',
      index: { searchableProperties: ['title', 'content'] },
      docs: { docs: { 1: { title: 'A', url: '/docs/a' }, 2: { title: 'B', url: '/docs/b' } } },
      sorting: { enabled: true },
      pinning: {},
    };

    const first = JSON.stringify({
      ...shared,
      internalDocumentIDStore: {
        internalIdToId: ['25775151-0', '25775151-1'],
      },
    });
    const second = JSON.stringify({
      ...shared,
      internalDocumentIDStore: {
        internalIdToId: ['25799174-0', '25799174-1'],
      },
    });

    const canonicalFirst = canonicalizeZBSearchDatabase(first);
    const canonicalSecond = canonicalizeZBSearchDatabase(second);

    expect(canonicalFirst).toBe(canonicalSecond);
    const parsed = JSON.parse(canonicalFirst);
    expect(parsed.internalDocumentIDStore.internalIdToId).toEqual([
      'static-search-1',
      'static-search-2',
    ]);
    expect(parsed.docs).toEqual(shared.docs);
    expect(parsed.index).toEqual(shared.index);
  });
});
