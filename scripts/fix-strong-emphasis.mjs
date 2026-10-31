#!/usr/bin/env node
/*
 * Repairs `**strong**` runs that CommonMark (and so MDX) leaves as literal
 * asterisks. A closing `**` only closes when it is not preceded by
 * punctuation, or is followed by whitespace or punctuation; an opening `**`
 * mirrors that. Chinese text breaks the rule all the time:
 *
 *   **解题过程：**由独立性知   ->  "：" before, "由" after: never closes
 *
 * The repair keeps the text and its emphasis and only moves punctuation:
 *
 *   **解题过程：**由      ->  **解题过程**：由
 *   是**“关键”**的       ->  是“**关键**”的
 *
 * and falls back to <strong>…</strong> when no punctuation can move
 * (`**$x$**的`). tests/markdown-emphasis.test.ts parses every document and
 * fails on any `**` left in the text, so run this before publishing:
 *
 *   node scripts/fix-strong-emphasis.mjs [--check] [files or directories…]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fixStrongEmphasis } from '../lib/markdown-emphasis.mjs';

async function collect(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (!entries) return /\.mdx?$/u.test(path) ? [path] : [];
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    files.push(...(await collect(resolve(path, entry.name))));
  }
  return files;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const targets = args.filter((arg) => !arg.startsWith('--'));
const files = (await Promise.all((targets.length ? targets : ['content']).map((target) => collect(resolve(target))))).flat();

let changedFiles = 0;
let repaired = 0;
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const result = fixStrongEmphasis(source);
  if (result.changes.length === 0) continue;
  changedFiles += 1;
  repaired += result.changes.length;
  for (const change of result.changes) {
    console.log(`${relative(process.cwd(), file)}:${change.line}  ${change.before}  ->  ${change.after}`);
  }
  if (!check) await writeFile(file, result.text);
}

console.log(`${check ? 'Found' : 'Repaired'} ${repaired} strong run(s) in ${changedFiles} file(s).`);
if (check && repaired > 0) process.exitCode = 1;
