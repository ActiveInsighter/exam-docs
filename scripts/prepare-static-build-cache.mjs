import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_EPOCH = 'study-layout-v3';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const cacheRoot = path.join(projectRoot, '.static-docs-stage', '.next', 'cache');
const markerPath = path.join(cacheRoot, '.fumadocs-static-cache-epoch');
const cacheScope = process.env.GITHUB_REPOSITORY || path.basename(projectRoot);
const expectedMarker = `${CACHE_EPOCH}\n${cacheScope}`;

let restoredMarker = '';
try {
  restoredMarker = (await readFile(markerPath, 'utf8')).trim();
} catch {
  // A restored cache created before cache markers were introduced has no marker.
}

if (restoredMarker !== expectedMarker) {
  console.log(
    `[static-docs] Resetting incompatible Turbopack cache for ${cacheScope}: ${restoredMarker || 'legacy'} -> ${expectedMarker.replace('\n', ' / ')}.`,
  );
  await rm(cacheRoot, { recursive: true, force: true });
} else {
  console.log(`[static-docs] Turbopack cache ${CACHE_EPOCH} for ${cacheScope} is compatible.`);
}

await mkdir(cacheRoot, { recursive: true });
await writeFile(markerPath, `${expectedMarker}\n`);
