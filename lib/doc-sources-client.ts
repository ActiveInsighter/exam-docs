'use client';

import { useEffect, useMemo, useState } from 'react';
import { indexSources, type SourceIndex, type SourceTree } from './doc-sources';

export const SOURCE_TREE_URL = '/doc-sources.json';

let pending: Promise<SourceTree> | null = null;
let loaded: SourceTree | null = null;

/** Fetched once per page load and shared; a failure is retried on the next call. */
export function loadSourceTree(): Promise<SourceTree> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= fetch(SOURCE_TREE_URL, { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const tree = (await response.json()) as SourceTree;
      if (!tree || !Array.isArray(tree.modules)) throw new Error('Invalid source tree');
      loaded = tree;
      return tree;
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/**
 * The sidebar tree used to name where answers came from. Until it arrives
 * (or if it cannot be fetched) `index` is null and sources fall back to
 * labels made from the page path.
 */
export function useSourceTree(enabled = true) {
  const [tree, setTree] = useState<SourceTree | null>(loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || tree) return;
    let disposed = false;
    loadSourceTree().then((value) => { if (!disposed) setTree(value); }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, [enabled, tree]);
  const index = useMemo<SourceIndex | null>(() => (tree ? indexSources(tree) : null), [tree]);
  return { tree, index, failed };
}
