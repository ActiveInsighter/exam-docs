import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';

function digest(json) {
  return createHash('sha256').update(json).digest('hex').slice(0, 12);
}

function compressionSizes(json) {
  return {
    bytes: Buffer.byteLength(json),
    gzipBytes: gzipSync(json, { level: 6 }).byteLength,
    brotliBytes: brotliCompressSync(json, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 },
    }).byteLength,
  };
}

export function canonicalizeZBSearchDatabase(rawJson) {
  const database = JSON.parse(rawJson);
  const ids = database?.internalDocumentIDStore?.internalIdToId;

  if (!Array.isArray(ids)) {
    throw new Error('Expected ZBSearch internalDocumentIDStore.internalIdToId array.');
  }

  // ZBSearch generates opaque external document ids when Fumadocs inserts
  // simple-search records without an explicit id. The search index, document
  // store, and sorter refer to compact numeric internal ids; the external ids
  // are only persisted here so the mapping can be rebuilt on load. Replacing
  // them with deterministic per-database ids preserves the same mapping shape
  // while removing run-to-run entropy from serialized static search assets.
  database.internalDocumentIDStore.internalIdToId = ids.map(
    (_value, index) => `static-search-${index + 1}`,
  );

  return JSON.stringify(database);
}

function canonicalFileName(url, canonicalJson) {
  const current = path.posix.basename(url);
  const nextDigest = digest(canonicalJson);

  if (/-[0-9a-f]{12}\.json$/i.test(current)) {
    return current.replace(/-[0-9a-f]{12}\.json$/i, `-${nextDigest}.json`);
  }

  return `${current.replace(/\.json$/i, '')}-${nextDigest}.json`;
}

export async function canonicalizeZBSearchManifest({ manifestFile }) {
  if (!manifestFile) throw new Error('canonicalizeZBSearchManifest requires manifestFile.');

  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (
    manifest?.version !== 2 ||
    manifest?.engine !== 'zbsearch' ||
    !Array.isArray(manifest?.core?.shards) ||
    !Array.isArray(manifest?.body?.shards)
  ) {
    throw new Error('Expected routed ZBSearch manifest before canonicalization.');
  }

  const outputRoot = path.dirname(manifestFile);
  let rewritten = 0;

  for (const shard of [...manifest.core.shards, ...manifest.body.shards]) {
    const oldPath = path.join(outputRoot, shard.url.replace(/^\//, ''));
    const canonicalJson = canonicalizeZBSearchDatabase(await readFile(oldPath, 'utf8'));
    const fileName = canonicalFileName(shard.url, canonicalJson);
    const nextUrl = `/search/${fileName}`;
    const nextPath = path.join(outputRoot, nextUrl.replace(/^\//, ''));

    await writeFile(nextPath, canonicalJson);
    if (nextPath !== oldPath) await rm(oldPath, { force: true });

    Object.assign(shard, {
      url: nextUrl,
      ...compressionSizes(canonicalJson),
    });
    rewritten += 1;
  }

  await writeFile(manifestFile, JSON.stringify(manifest));
  return { rewritten };
}
