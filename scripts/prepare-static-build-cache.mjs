import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_EPOCH = 'study-layout-v2';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const cacheRoot = path.join(projectRoot, '.static-docs-stage', '.next', 'cache');
const markerPath = path.join(cacheRoot, '.fumadocs-static-cache-epoch');

let restoredEpoch = '';
try {
  restoredEpoch = (await readFile(markerPath, 'utf8')).trim();
} catch {
  // A restored cache created before cache epochs were introduced has no marker.
}

if (restoredEpoch !== CACHE_EPOCH) {
  console.log(
    `[static-docs] Resetting incompatible Turbopack cache: ${restoredEpoch || 'legacy'} -> ${CACHE_EPOCH}.`,
  );
  await rm(cacheRoot, { recursive: true, force: true });
} else {
  console.log(`[static-docs] Turbopack cache epoch ${CACHE_EPOCH} is compatible.`);
}

await mkdir(cacheRoot, { recursive: true });
await writeFile(markerPath, `${CACHE_EPOCH}\n`);
