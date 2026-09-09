export type StaticDocParam = {
  slug?: string[];
};

export function getStaticDocRouteKey(param: StaticDocParam) {
  return (param.slug ?? []).join('/');
}

function compareRouteKeys(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeWeight(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Return one deterministic owner for every final documentation route.
 *
 * Fumadocs does not promise a stable enumeration order across processes and
 * can surface duplicate params that normalize to one final route. We therefore
 * de-duplicate and sort by the final URL first. When a weight resolver is
 * supplied, routes are assigned with deterministic LPT bin packing so large
 * pages are spread across workers instead of clustering by URL order.
 */
export function shardStaticDocParams<T extends StaticDocParam>(
  sourceParams: Iterable<T>,
  shardCount = 1,
  shardIndex = 0,
  getWeight?: (param: T) => number,
): T[] {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`Invalid static docs shard count: ${shardCount}.`);
  }
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
    throw new Error(`Invalid static docs shard ${shardIndex}/${shardCount}.`);
  }

  const unique = new Map<string, T>();
  for (const param of sourceParams) {
    const key = getStaticDocRouteKey(param);
    if (!unique.has(key)) unique.set(key, param);
  }

  const sorted = Array.from(unique.entries())
    .sort(([left], [right]) => compareRouteKeys(left, right))
    .map(([, param]) => param);

  if (shardCount === 1) return sorted;
  if (!getWeight) return sorted.filter((_, index) => index % shardCount === shardIndex);

  const weighted = sorted
    .map((param) => ({
      param,
      key: getStaticDocRouteKey(param),
      weight: normalizeWeight(getWeight(param)),
    }))
    .sort((left, right) => right.weight - left.weight || compareRouteKeys(left.key, right.key));

  const shards = Array.from({ length: shardCount }, (_, index) => ({
    index,
    totalWeight: 0,
    items: [] as typeof weighted,
  }));

  for (const item of weighted) {
    let target = shards[0];
    for (const candidate of shards.slice(1)) {
      if (
        candidate.totalWeight < target.totalWeight ||
        (candidate.totalWeight === target.totalWeight && candidate.items.length < target.items.length) ||
        (candidate.totalWeight === target.totalWeight &&
          candidate.items.length === target.items.length &&
          candidate.index < target.index)
      ) {
        target = candidate;
      }
    }
    target.items.push(item);
    target.totalWeight += item.weight;
  }

  return shards[shardIndex].items
    .sort((left, right) => compareRouteKeys(left.key, right.key))
    .map(({ param }) => param);
}
