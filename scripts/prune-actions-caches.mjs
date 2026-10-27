// Prune only known CI caches. Never delete unknown caches or the latest
// cache in a live cache family. Uses GitHub's cache REST API (actions:write).
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const dryRun = process.env.DRY_RUN === 'true';
if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
const root = `https://api.github.com/repos/${repository}/actions/caches`;
const headers = {
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
};
async function api(url, method = 'GET') {
  const response = await fetch(url, { headers, method });
  if (!response.ok) throw new Error(`${method} ${url}: HTTP ${response.status} ${await response.text()}`);
  return method === 'DELETE' ? null : response.json();
}
const caches = [];
for (let page = 1; page <= 100; page++) {
  const result = await api(`${root}?per_page=100&page=${page}`);
  caches.push(...result.actions_caches);
  if (result.actions_caches.length < 100) break;
  if (page === 100) throw new Error('Cache inventory is truncated; aborting cleanup');
}
function family(item) {
  const key = item.key;
  const shard = key.match(/(?:^|-)(?:next-bounded|weighted-search)-(\d+)-shard-(\d+)-v\d+-/);
  if (shard) return `${item.ref}:shard-${shard[1]}-${shard[2]}`;
  const oldShard = key.match(/(?:^|-)(?:weighted-static-shard|static-shard)-(\d+)-v\d+-/);
  if (oldShard) return `${item.ref}:legacy-shard-${oldShard[1]}`;
  if (key.includes('-static-search-')) return `${item.ref}:search`;
  if (key.includes('-node22-modules-')) return `${item.ref}:modules`;
  if (key.includes('-node22-npm-') || key.startsWith('node-cache-')) return `${item.ref}:npm`;
  if (key.includes('-myskills-next-bounded-')) return `${item.ref}:myskills-compiler`;
  return null; // do not touch unrelated caches
}
const groups = new Map();
for (const entry of caches) {
  const f = family(entry);
  if (!f) continue;
  if (!groups.has(f)) groups.set(f, []);
  groups.get(f).push(entry);
}
// Only retire the previous cache generation after a successful production
// run has created at least four modern shard caches on main. Legacy keys are
// no longer restored by the production build, so retaining them wastes quota.
const modernMainShards = new Set(
  caches
    .filter(c => c.ref === 'refs/heads/main' && /-next-bounded-\d+-shard-\d+-v\d+-/.test(c.key))
    .map(c => c.key.match(/-next-bounded-\d+-shard-(\d+)-v\d+-/)[1]),
);
const safeToRetireLegacy = modernMainShards.size >= 4;
const now = Date.now();
const ageHours = x => (now - Date.parse(x.last_accessed_at || x.created_at)) / 3600000;
const createdHours = x => (now - Date.parse(x.created_at)) / 3600000;
const last = x => Date.parse(x.last_accessed_at || x.created_at);
const selected = new Map();
for (const entries of groups.values()) {
  entries.sort((a, b) => last(b) - last(a));
  for (let i = 0; i < entries.length; i++) {
    const c = entries[i];
    // The new production workflow no longer reads weighted-search/static-shard
    // keys. Once a modern cache generation exists, reclaim replaced main keys
    // immediately, but never touch an upload from the last hour.
    const replacedMain = safeToRetireLegacy && c.ref === 'refs/heads/main';
    const legacyMain = replacedMain &&
      /-(?:weighted-search-\d+-shard-|weighted-static-shard-|static-shard-)/.test(c.key);
    const obsoleteSearch = replacedMain && i > 0 && c.key.includes('-static-search-');
    if (createdHours(c) >= 1 && (legacyMain || obsoleteSearch)) {
      selected.set(c.id, c);
      continue;
    }
    // Other cache families retain the original, conservative grace period.
    if (ageHours(c) < 36 || createdHours(c) < 24) continue;
    const legacy = /-(?:weighted-search-\d+-shard-|weighted-static-shard-|static-shard-)/.test(c.key);
    const stalePr = c.ref.startsWith('refs/pull/') && ageHours(c) >= 72;
    if ((legacy && ageHours(c) >= 72) || stalePr || (i >= 2 && ageHours(c) >= 48)) {
      selected.set(c.id, c);
    }
  }
}
const budget = 8 * 1024 ** 3;
const totalBytes = caches.reduce((sum, x) => sum + x.size_in_bytes, 0);
let remaining = totalBytes - [...selected.values()].reduce((sum, x) => sum + x.size_in_bytes, 0);
if (remaining > budget) {
  const spare = [];
  for (const entries of groups.values()) {
    for (let i = 1; i < entries.length; i++) {
      const c = entries[i];
      if (!selected.has(c.id) && ageHours(c) >= 36 && createdHours(c) >= 24) spare.push(c);
    }
  }
  spare.sort((a, b) => last(a) - last(b));
  for (const c of spare) {
    if (remaining <= budget) break;
    selected.set(c.id, c);
    remaining -= c.size_in_bytes;
  }
}
let removed = 0;
let freed = 0;
for (const c of selected.values()) {
  if (!dryRun) {
    await api(`${root}/${c.id}`, 'DELETE');
  }
  removed++;
  freed += c.size_in_bytes;
  console.log(`${dryRun ? 'Would delete' : 'Deleted'} ${c.id} ${c.key} ${(c.size_in_bytes / 1048576).toFixed(1)} MiB`);
}
const summary = [
  '### GitHub Actions cache maintenance',
  `- Mode: ${dryRun ? 'dry run' : 'delete eligible caches'}`,
  `- Inventory: ${caches.length} caches / ${(totalBytes / 1024 ** 3).toFixed(2)} GiB`,
  `- ${dryRun ? 'Eligible' : 'Deleted'}: ${removed} / ${(freed / 1024 ** 3).toFixed(2)} GiB`,
  `- Remaining estimated: ${((totalBytes - freed) / 1024 ** 3).toFixed(2)} GiB`,
  '- Safeguards: 24h creation grace; 36h inactivity grace; latest per cache family is retained (except old PR/legacy caches).',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}
