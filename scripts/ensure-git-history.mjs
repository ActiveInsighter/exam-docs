import { spawnSync } from 'node:child_process';

const probe = spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});

// Local archives or generated source packages may not contain .git metadata.
// In that case there is nothing useful to deepen here; let Fumadocs handle it.
if (probe.status !== 0) process.exit(0);

if (probe.stdout.trim() !== 'true') process.exit(0);

console.log('[git] Shallow clone detected; fetching full history for lastModified metadata.');
// We only need commit/tree history for lastModified, not obsolete image/code blobs.
// GitHub supports partial-clone filters; avoid downloading every historical
// version of large assets on each of the parallel CI runners.
const fetch = spawnSync('git', ['fetch', '--unshallow', '--quiet', '--no-tags', '--filter=blob:none'], {
  stdio: 'inherit',
});

if (fetch.status !== 0) {
  console.error('[git] Failed to fetch full history required by the Fumadocs lastModified plugin.');
  process.exit(fetch.status ?? 1);
}
