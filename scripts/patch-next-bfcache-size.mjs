// Next 16.4.3 charges every back/forward cache entry 100 bytes against the
// client router's 50 MB LRU, whatever the segment holds. A question page's
// segment keeps its whole Flight response alive (5–14 MB here, mostly the
// pre-rendered KaTeX strings), so the LRU never evicts and every page visited
// stays in memory until the tab dies: on phones the browser kills the page
// after a few dozen client-side navigations.
//
// Charging each entry 8 MiB makes the LRU keep about the current route's
// segments; going back to an evicted page refetches its static payload.
// Recheck on upgrades: upstream plans to replace the size heuristic.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BFCACHE_ENTRY_BYTES = 8 * 1024 * 1024;
const original = 'size: 100,';
const replacement = `size: ${BFCACHE_ENTRY_BYTES},`;
const modules = [
  'next/dist/esm/client/components/segment-cache/bfcache.js',
  'next/dist/client/components/segment-cache/bfcache.js',
];

export async function patchNextBfcacheSize() {
  for (const specifier of modules) {
    const path = fileURLToPath(import.meta.resolve(specifier));
    const source = await readFile(path, 'utf8');
    const count = (text) => source.split(text).length - 1;
    if (count(original) + count(replacement) !== 1 || !source.includes('function writeToBFCache(')) {
      throw new Error(`Next back/forward cache changed (${specifier}); review the entry size patch.`);
    }
    if (source.includes(original)) await writeFile(path, source.replace(original, replacement));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await patchNextBfcacheSize();
  console.log(`[next] Back/forward cache entries charged ${BFCACHE_ENTRY_BYTES} bytes.`);
}
