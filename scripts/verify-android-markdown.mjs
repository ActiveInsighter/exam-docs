import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { androidMarkdownVersion } from '../lib/markdown-export.mjs';

const root = process.argv[2] ?? '.static-docs';
const expectedCount = Number(process.argv[3]);
const manifest = JSON.parse(await readFile(path.join(root, 'doc-sources.json'), 'utf8'));
if (manifest.androidMarkdownVersion !== androidMarkdownVersion) {
  throw new Error('The directory manifest does not advertise the Android export version.');
}

const urls = new Set();
function walk(nodes) {
  for (const node of nodes) {
    if (node.kind === 'folder') walk(node.children);
    else if (node.kind === 'page') urls.add(node.url);
  }
}
walk(manifest.modules);
const exports = (await readdir(path.join(root, 'android'), { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'));
if (exports.length !== expectedCount || urls.size === 0) {
  throw new Error(`Found ${exports.length} Android exports (expected ${expectedCount}) and ${urls.size} listed pages.`);
}
for (const url of urls) {
  if (!/^\/docs(?:\/[^?#]+)?$/u.test(url)) throw new Error(`Invalid document URL: ${url}`);
  const file = path.join(root, 'android', `${url.slice(1)}.md`);
  const markdown = await readFile(file, 'utf8');
  if (!/^#[ \t]+/u.test(markdown)) throw new Error(`Missing Android document title: ${file}`);
}
console.log(`Verified ${urls.size} Android Markdown exports and their directory paths.`);
