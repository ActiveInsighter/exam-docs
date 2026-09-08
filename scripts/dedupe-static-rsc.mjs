import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = path.resolve('.static-docs');
const docsRoot = path.join(outputRoot, 'docs');
const edgeOneConfigPath = path.join(outputRoot, 'edgeone.json');
const sharedDocsCanonical = path.join(docsRoot, '__next.docs.txt');

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function assertSameFile(leftPath, rightPath, label) {
  const [leftStat, rightStat] = await Promise.all([stat(leftPath), stat(rightPath)]);
  if (leftStat.size !== rightStat.size) {
    throw new Error(`${label} size mismatch: ${leftPath} (${leftStat.size}) != ${rightPath} (${rightStat.size}).`);
  }

  const [leftHash, rightHash] = await Promise.all([sha256(leftPath), sha256(rightPath)]);
  if (leftHash !== rightHash) {
    throw new Error(`${label} SHA-256 mismatch: ${leftPath} != ${rightPath}.`);
  }

  return leftStat.size;
}

if (!(await exists(docsRoot))) {
  throw new Error(`Static docs root does not exist: ${docsRoot}`);
}

if (process.env.STATIC_DOCS_DISABLE_RSC_DEDUPE === '1') {
  await writeFile(edgeOneConfigPath, `${JSON.stringify({ rewrites: [] }, null, 2)}\n`, 'utf8');
  console.log('[rsc-dedupe] Disabled for this build; retaining all original RSC files.');
} else {

const initialFiles = await walk(docsRoot);
const indexAliases = initialFiles.filter((filePath) => path.basename(filePath) === 'index.txt');
if (indexAliases.length === 0) {
  throw new Error('No docs index.txt RSC aliases found; Next export layout may have changed. Refusing to deduplicate.');
}

let removedIndexBytes = 0;
for (const indexAlias of indexAliases) {
  const fullPayload = path.join(path.dirname(indexAlias), '__next._full.txt');
  if (!(await exists(fullPayload))) {
    throw new Error(`Missing sibling __next._full.txt for ${indexAlias}. Refusing to install a global rewrite.`);
  }
  removedIndexBytes += await assertSameFile(indexAlias, fullPayload, 'Full-route RSC alias');
}

for (const indexAlias of indexAliases) {
  await rm(indexAlias);
}

const sharedDocsAliases = initialFiles.filter((filePath) => path.basename(filePath) === '__next.docs.txt');
if (sharedDocsAliases.length === 0) {
  throw new Error('No __next.docs.txt payloads found; Next export layout may have changed. Refusing to deduplicate.');
}

const canonicalSource = sharedDocsAliases[0];
const canonicalHash = await sha256(canonicalSource);
const canonicalSize = (await stat(canonicalSource)).size;
for (const candidate of sharedDocsAliases.slice(1)) {
  const candidateStat = await stat(candidate);
  if (candidateStat.size !== canonicalSize || (await sha256(candidate)) !== canonicalHash) {
    throw new Error(`Shared docs RSC payload differs at ${candidate}. Refusing to install a global rewrite.`);
  }
}

await mkdir(docsRoot, { recursive: true });
if (canonicalSource !== sharedDocsCanonical) {
  await copyFile(canonicalSource, sharedDocsCanonical);
}

let removedSharedBytes = 0;
for (const candidate of sharedDocsAliases) {
  if (candidate === sharedDocsCanonical) continue;
  removedSharedBytes += (await stat(candidate)).size;
  await rm(candidate);
}

const edgeOneConfig = {
  rewrites: [
    {
      source: '/docs/*/index.txt',
      destination: '/docs/:splat/__next._full.txt',
    },
    {
      source: '/docs/*/__next.docs.txt',
      destination: '/docs/__next.docs.txt',
    },
  ],
};

await writeFile(edgeOneConfigPath, `${JSON.stringify(edgeOneConfig, null, 2)}\n`, 'utf8');

const removedBytes = removedIndexBytes + removedSharedBytes;
console.log(
  `[rsc-dedupe] Verified and removed ${indexAliases.length} index.txt aliases (${formatMiB(removedIndexBytes)}).`,
);
console.log(
  `[rsc-dedupe] Collapsed ${sharedDocsAliases.length} identical __next.docs.txt payloads to one canonical copy (${formatMiB(removedSharedBytes)} removed).`,
);
console.log(`[rsc-dedupe] Total static RSC reduction: ${formatMiB(removedBytes)}.`);
console.log('[rsc-dedupe] Wrote EdgeOne rewrites for both removed alias families.');
}
