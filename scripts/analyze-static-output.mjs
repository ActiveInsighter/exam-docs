import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, '.static-docs');

function mib(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filePath)));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function topArea(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.startsWith('_next/static/')) return '_next/static';
  if (normalized.startsWith('_next/')) return '_next/other';
  if (normalized.startsWith('search/')) return 'search';
  if (normalized.startsWith('docs/')) return 'docs';
  const slash = normalized.indexOf('/');
  return slash === -1 ? '(root)' : normalized.slice(0, slash);
}

function extensionOf(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  return ext || '(none)';
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function addBucket(map, key, size) {
  const bucket = map.get(key) ?? { files: 0, bytes: 0 };
  bucket.files += 1;
  bucket.bytes += size;
  map.set(key, bucket);
}

function printBuckets(title, map, limit = Infinity) {
  console.log(`[footprint] ${title}`);
  for (const [name, bucket] of [...map.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, limit)) {
    console.log(`[footprint]   ${name}: ${bucket.files} files, ${mib(bucket.bytes)}`);
  }
}

const files = await walk(outputRoot);
const records = [];
const areaBuckets = new Map();
const extensionBuckets = new Map();
const docsExtensionBuckets = new Map();
const docsTxtBasenameBuckets = new Map();
let totalBytes = 0;

for (const filePath of files) {
  const relativePath = path.relative(outputRoot, filePath).replaceAll('\\', '/');
  const size = (await stat(filePath)).size;
  const area = topArea(relativePath);
  const ext = extensionOf(relativePath);
  records.push({ filePath, relativePath, size, area, ext });
  totalBytes += size;
  addBucket(areaBuckets, area, size);
  addBucket(extensionBuckets, ext, size);
  if (area === 'docs') {
    addBucket(docsExtensionBuckets, ext, size);
    if (ext === '.txt') addBucket(docsTxtBasenameBuckets, path.basename(relativePath), size);
  }
}

console.log(`[footprint] total: ${files.length} files, ${mib(totalBytes)}`);
printBuckets('top-level areas', areaBuckets);
printBuckets('extensions', extensionBuckets);
printBuckets('docs extensions', docsExtensionBuckets);
printBuckets('docs RSC payload basenames', docsTxtBasenameBuckets, 30);

console.log('[footprint] largest files');
for (const record of [...records].sort((a, b) => b.size - a.size).slice(0, 25)) {
  console.log(`[footprint]   ${mib(record.size)} ${record.relativePath}`);
}

// Hash only files >= 32 KiB. Tiny metadata files cannot materially explain a
// hundreds-of-megabytes footprint, and skipping them keeps diagnostics cheap.
const hashGroups = new Map();
for (const record of records) {
  if (record.size < 32 * 1024) continue;
  const digest = await sha256(record.filePath);
  const group = hashGroups.get(digest) ?? { size: record.size, paths: [] };
  group.paths.push(record.relativePath);
  hashGroups.set(digest, group);
}

const duplicates = [...hashGroups.values()]
  .filter((group) => group.paths.length > 1)
  .map((group) => ({
    ...group,
    redundantBytes: group.size * (group.paths.length - 1),
  }))
  .sort((a, b) => b.redundantBytes - a.redundantBytes);

const duplicateBytes = duplicates.reduce((sum, group) => sum + group.redundantBytes, 0);
console.log(`[footprint] exact duplicate redundancy (>=32 KiB files): ${mib(duplicateBytes)}`);
for (const group of duplicates.slice(0, 20)) {
  console.log(
    `[footprint]   ${group.paths.length} copies × ${mib(group.size)} = ${mib(group.redundantBytes)} redundant; example ${group.paths[0]}`,
  );
}
