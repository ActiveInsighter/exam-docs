import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findMissingStaticAssetReferences } from '../scripts/verify-static-asset-references.mjs';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'exam-static-refs-'));
  roots.push(root);
  await mkdir(join(root, '_next/static/chunks'), { recursive: true });
  await mkdir(join(root, 'docs/example'), { recursive: true });
  return root;
}

describe('static asset reference verification', () => {
  it('accepts merged outputs when every referenced static chunk exists', async () => {
    const root = await fixture();
    await writeFile(join(root, '_next/static/chunks/a.css'), 'body{}');
    await writeFile(
      join(root, 'docs/example/index.html'),
      '<link rel="stylesheet" href="/_next/static/chunks/a.css">',
    );

    const result = await findMissingStaticAssetReferences(root);
    expect(result.uniqueReferences).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('reports route payloads whose shard-specific static chunk was not merged', async () => {
    const root = await fixture();
    await writeFile(
      join(root, 'docs/example/__next._full.txt'),
      '1:["/_next/static/chunks/shard-only.css"]',
    );

    const result = await findMissingStaticAssetReferences(root);
    expect(result.missing).toEqual([
      {
        reference: '/_next/static/chunks/shard-only.css',
        sources: ['docs/example/__next._full.txt'],
      },
    ]);
  });
});
