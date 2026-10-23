// Mermaid 12.2.0 eagerly JSON-stringifies D3 selections in block-layout debug
// logs. In React, their documentElement parent has a circular Fiber reference.
// Keep the log data as objects so logging never serializes the DOM. This patch
// applies to the package entry point and the unminified browser ESM entry only.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mermaidRoot = dirname(fileURLToPath(import.meta.resolve('mermaid/package.json')));
const { version } = JSON.parse(await readFile(join(mermaidRoot, 'package.json'), 'utf8'));
if (version !== '12.2.0') {
  throw new Error(`Review the Mermaid block-layout workaround for version ${version}.`);
}

for (const format of ['mermaid.core', 'mermaid.esm']) {
  const dir = join(mermaidRoot, 'dist', 'chunks', format);
  const files = (await readdir(dir)).filter((name) => /^blockDiagram-.*\.mjs$/.test(name));
  if (files.length !== 1) throw new Error(`Expected one Mermaid block chunk in ${format}.`);
  const path = join(dir, files[0]);
  const source = await readFile(path, 'utf8');
  const patched = source
    .replace('${JSON.stringify(child.size)}', '${child.size?.width} x ${child.size?.height}')
    .replace('log.debug("getBlocks", JSON.stringify(root, null, 2));', 'log.debug("getBlocks", root);');
  if (!patched.includes('${child.size?.width} x ${child.size?.height}') ||
      !patched.includes('log.debug("getBlocks", root);')) {
    throw new Error(`Mermaid block-layout source changed in ${format}; review the workaround.`);
  }
  if (patched !== source) await writeFile(path, patched);
}
console.log('[mermaid] React-safe block-layout debug logging verified.');
