import { describe, expect, it } from 'vitest';

// @ts-expect-error The deployment helper is intentionally a Node.js ESM script.
import { buildEdgeOneRewrites } from '../scripts/dedupe-static-rsc.mjs';

describe('static RSC deduplication', () => {
  it('does not require retired Next export aliases', () => {
    expect(
      buildEdgeOneRewrites({
        hasIndexAliasRewrite: false,
        hasSharedDocsAliasRewrite: false,
      }),
    ).toEqual([]);
  });

  it('keeps rewrites only for alias families that were actually removed', () => {
    expect(
      buildEdgeOneRewrites({
        hasIndexAliasRewrite: true,
        hasSharedDocsAliasRewrite: false,
      }),
    ).toEqual([
      {
        source: '/docs/*/index.txt',
        destination: '/docs/:splat/__next._full.txt',
      },
    ]);

    expect(
      buildEdgeOneRewrites({
        hasIndexAliasRewrite: false,
        hasSharedDocsAliasRewrite: true,
      }),
    ).toEqual([
      {
        source: '/docs/*/__next.docs.txt',
        destination: '/docs/__next.docs.txt',
      },
    ]);
  });
});
