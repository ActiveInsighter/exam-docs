import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = join(process.cwd(), 'content', 'docs', 'math', 'supplements');
const checkOnly = process.argv.includes('--check');

async function collectMdxFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectMdxFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.mdx')) files.push(path);
  }

  return files.sort();
}

function normalizeHeadingLevels(source) {
  const lines = source.split('\n');
  let fence = null;
  let changedHeadings = 0;

  const normalized = lines.map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return line;
    }

    if (fence !== null) return line;

    const headingMatch = line.match(/^(#{1,6})(\s+.*)$/u);
    if (!headingMatch) return line;

    const currentLevel = headingMatch[1].length;
    const targetLevel = currentLevel === 1 ? 2 : currentLevel >= 4 ? 3 : currentLevel;
    if (targetLevel === currentLevel) return line;

    changedHeadings += 1;
    return `${'#'.repeat(targetLevel)}${headingMatch[2]}`;
  }).join('\n');

  return { normalized, changedHeadings };
}

const files = await collectMdxFiles(root);
const changedFiles = [];
let changedHeadingCount = 0;

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const { normalized, changedHeadings } = normalizeHeadingLevels(source);

  if (normalized !== source) {
    changedFiles.push(relative(process.cwd(), file));
    changedHeadingCount += changedHeadings;
    if (!checkOnly) await writeFile(file, normalized, 'utf8');
  }
}

if (checkOnly && changedFiles.length > 0) {
  console.error('Math supplement heading validation failed. Only H2/H3 headings are allowed in document bodies.');
  for (const file of changedFiles) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? 'Validated' : 'Normalized'} ${files.length} MDX files; ${changedFiles.length} files and ${changedHeadingCount} headings required changes.`);
}
