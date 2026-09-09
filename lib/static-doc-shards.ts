export type StaticDocParam = {
  slug?: string[];
};

export function getStaticDocRouteKey(param: StaticDocParam) {
  return (param.slug ?? []).join('/');
}

function compareRouteKeys(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Return one deterministic owner for every final documentation route.
 *
 * Fumadocs does not promise a stable enumeration order across processes and
 * can surface duplicate params that normalize to one final route. We therefore
 * de-duplicate and sort by the final URL before applying index-based sharding.
 */
export function shardStaticDocParams<T extends StaticDocParam>(
  sourceParams: Iterable<T>,
  shardCount = 1,
  shardIndex = 0,
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
  return sorted.filter((_, index) => index % shardCount === shardIndex);
}
