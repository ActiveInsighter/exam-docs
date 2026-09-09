import { describe, expect, it } from 'vitest';
import { getStaticDocRouteKey, shardStaticDocParams } from '../lib/static-doc-shards';

type Param = { slug?: string[]; marker?: string };

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

  it('rejects invalid shard coordinates', () => {
    expect(() => shardStaticDocParams(params, 0, 0)).toThrow(/shard count/);
    expect(() => shardStaticDocParams(params, 4, 4)).toThrow(/Invalid static docs shard/);
    expect(() => shardStaticDocParams(params, 4, -1)).toThrow(/Invalid static docs shard/);
  });
});
