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
const exports = new Set((await readdir(path.join(root, 'android'), { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => path.join(entry.parentPath, entry.name)));
if (exports.size !== expectedCount || urls.size === 0) {
  throw new Error(`Found ${exports.size} Android exports (expected ${expectedCount}) and ${urls.size} listed pages.`);
}
for (const url of urls) {
  if (!/^\/docs(?:\/[^?#]+)?$/u.test(url)) throw new Error(`Invalid document URL: ${url}`);
  const file = path.join(root, 'android', `${url.slice(1)}.md`);
  if (!exports.has(file)) throw new Error(`Missing Android document: ${file}`);
}
for (const file of exports) {
  const markdown = await readFile(file, 'utf8');
  if (!/^#[ \t]+/u.test(markdown)) throw new Error(`Missing Android document title: ${file}`);

  // Match the reader's directive and fence boundaries.
  let fence = null;
  let depth = 0;
  for (const [index, line] of markdown.split('\n').entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker) {
      fence = marker[1];
    } else if (/^ {0,3}:::[ \t]*[\w-]+(?:[ \t].*)?$/u.test(line)) {
      depth += 1;
    } else if (/^ {0,3}:::[ \t]*$/u.test(line)) {
      depth -= 1;
      if (depth < 0) throw new Error(`Unmatched Android directive at ${file}:${index + 1}`);
    }
  }
  if (depth !== 0) throw new Error(`Unclosed Android directive in ${file}`);
}
console.log(`Verified ${exports.size} Android Markdown exports and ${urls.size} directory paths.`);
