import { describe, expect, it } from 'vitest';
import { getStaticDocRouteKey, shardStaticDocParams } from '../lib/static-doc-shards';

type Param = { slug?: string[]; marker?: string; weight?: number };

const params: Param[] = [
  { slug: ['z'] },
  { slug: ['a', '2'] },
  { slug: ['a', '1'] },
  { slug: ['z'], marker: 'duplicate' },
  { slug: ['中文', '二'] },
  { slug: ['中文', '一'] },
];

describe('static documentation sharding', () => {
  it('deduplicates final routes before assigning owners', () => {
    const all = shardStaticDocParams(params);
    expect(all.map(getStaticDocRouteKey)).toEqual([
      'a/1',
      'a/2',
      'z',
      '中文/一',
      '中文/二',
    ]);
    expect(all.find((param) => getStaticDocRouteKey(param) === 'z')?.marker).toBeUndefined();
  });

  it('gives every route exactly one owner independent of input order', () => {
    const forward = Array.from({ length: 4 }, (_, shard) =>
      shardStaticDocParams(params, 4, shard).map(getStaticDocRouteKey),
    );
    const reversed = Array.from({ length: 4 }, (_, shard) =>
      shardStaticDocParams([...params].reverse(), 4, shard).map(getStaticDocRouteKey),
    );

    expect(reversed).toEqual(forward);
    const flattened = forward.flat();
    expect(flattened).toHaveLength(5);
    expect(new Set(flattened).size).toBe(5);
    expect(flattened.sort()).toEqual(['a/1', 'a/2', 'z', '中文/一', '中文/二'].sort());
  });

  it('balances heavy routes deterministically when weights are supplied', () => {
    const weighted: Param[] = [
      { slug: ['huge-a'], weight: 100 },
      { slug: ['huge-b'], weight: 90 },
      { slug: ['medium-a'], weight: 40 },
      { slug: ['medium-b'], weight: 30 },
      { slug: ['small-a'], weight: 10 },
      { slug: ['small-b'], weight: 10 },
    ];
    const getWeight = (param: Param) => param.weight ?? 1;

    const forward = Array.from({ length: 2 }, (_, shard) =>
      shardStaticDocParams(weighted, 2, shard, getWeight),
    );
    const reversed = Array.from({ length: 2 }, (_, shard) =>
      shardStaticDocParams([...weighted].reverse(), 2, shard, getWeight),
    );

    expect(reversed.map((items) => items.map(getStaticDocRouteKey))).toEqual(
      forward.map((items) => items.map(getStaticDocRouteKey)),
    );

    const totals = forward.map((items) =>
      items.reduce((sum, item) => sum + getWeight(item), 0),
    );
    expect(totals).toEqual([140, 140]);
    expect(forward.flat().map(getStaticDocRouteKey).sort()).toEqual(
      weighted.map(getStaticDocRouteKey).sort(),
    );
  });

  it('normalizes invalid weights instead of losing routes', () => {
    const weighted: Param[] = [
      { slug: ['a'], weight: 0 },
      { slug: ['b'], weight: Number.NaN },
      { slug: ['c'], weight: 2 },
    ];
    const routes = Array.from({ length: 2 }, (_, shard) =>
      shardStaticDocParams(weighted, 2, shard, (param) => param.weight ?? 1),
    ).flat();
    expect(routes.map(getStaticDocRouteKey).sort()).toEqual(['a', 'b', 'c']);
  });

  it('rejects invalid shard coordinates', () => {
    expect(() => shardStaticDocParams(params, 0, 0)).toThrow(/shard count/);
    expect(() => shardStaticDocParams(params, 4, 4)).toThrow(/Invalid static docs shard/);
    expect(() => shardStaticDocParams(params, 4, -1)).toThrow(/Invalid static docs shard/);
  });
});
