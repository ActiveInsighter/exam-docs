import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, '..');

const SHELL_ENTRIES = [
  'app',
  'components',
  'lib',
  'package.json',
  'package-lock.json',
  'next.config.static.mjs',
  'postcss.config.mjs',
  'source.config.ts',
  'tsconfig.json',
  'scripts/static-docs-config.mjs',
  'scripts/static-root-layout.tsx',
];

const ROUTE_ROOTS = ['content/docs', 'content/blog'];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root, current = root) {
  if (!(await exists(current))) return [];
  const currentStat = await stat(current);
  if (currentStat.isFile()) return [current];

  const files = [];
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const entry of entries) {
    const filePath = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, filePath)));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function addField(hash, label, value) {
  hash.update(label);
  hash.update('\0');
  hash.update(value);
  hash.update('\0');
}

/**
 * Build ID for the shared static application shell.
 *
 * Runtime code/configuration bytes are hashed, while documentation/blog source
 * files contribute only their paths. Editing one document body therefore keeps
 * the shared `_next/static/<build-id>` namespace stable, but adding/removing a
 * route or changing code/styles/dependencies produces a new namespace.
 */
export async function computeStaticBuildId(projectRoot = defaultProjectRoot) {
  const hash = createHash('sha256');
  addField(hash, 'format', 'exam-docs-static-shell-v1');

  for (const entry of SHELL_ENTRIES) {
    const absoluteEntry = path.join(projectRoot, entry);
    if (!(await exists(absoluteEntry))) continue;
    const files = await walkFiles(projectRoot, absoluteEntry);
    for (const filePath of files) {
      const relativePath = path.relative(projectRoot, filePath).replaceAll('\\', '/');
      addField(hash, 'shell-path', relativePath);
      hash.update(await readFile(filePath));
      hash.update('\0');
    }
  }

  const routePaths = [];
  for (const routeRoot of ROUTE_ROOTS) {
    const absoluteRoot = path.join(projectRoot, routeRoot);
    for (const filePath of await walkFiles(projectRoot, absoluteRoot)) {
      const relativePath = path.relative(projectRoot, filePath).replaceAll('\\', '/');
      if (/\.(md|mdx)$/i.test(relativePath)) routePaths.push(relativePath);
    }
  }
  routePaths.sort();
  for (const routePath of routePaths) addField(hash, 'route-path', routePath);

  return `exam-docs-static-${hash.digest('hex').slice(0, 16)}`;
}

async function main() {
  console.log(await computeStaticBuildId());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[static-build-id] Failed to compute build id.', error);
    process.exitCode = 1;
  });
}
