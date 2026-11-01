// Fails the build when the emitted client router still charges back/forward
// cache entries 100 bytes, e.g. because a restored compiler cache predates
// scripts/patch-next-bfcache-size.mjs. See that script for why it matters.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { BFCACHE_ENTRY_BYTES } from './patch-next-bfcache-size.mjs';

const chunksRoot = path.resolve(process.argv[2] ?? '.static-docs', '_next', 'static', 'chunks');
const ENTRY = /ref:null,size:([0-9a-fx.e]+),navigatedAt:/giu;

const sizes = [];
for (const name of await readdir(chunksRoot)) {
  if (!name.endsWith('.js')) continue;
  const source = await readFile(path.join(chunksRoot, name), 'utf8');
  for (const match of source.matchAll(ENTRY)) sizes.push({ name, size: Number(match[1]) });
}

if (sizes.length === 0) {
  throw new Error(`No back/forward cache entry found in ${chunksRoot}; review scripts/verify-next-bfcache-patch.mjs.`);
}
const unpatched = sizes.filter(({ size }) => size !== BFCACHE_ENTRY_BYTES);
if (unpatched.length) {
  throw new Error(`Client router chunks still use the unpatched back/forward cache entry size: ${unpatched.map(({ name, size }) => `${name} (${size})`).join(', ')}. Clear the Turbopack cache and rebuild.`);
}
console.log(`[next] Back/forward cache entry size verified in ${sizes.length} client chunk(s).`);
