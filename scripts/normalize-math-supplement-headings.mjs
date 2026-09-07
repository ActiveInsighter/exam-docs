import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

const root = join(process.cwd(), 'content', 'docs', 'math', 'supplements');
const checkOnly = process.argv.includes('--check');
const chineseMajorPattern = /^[一二三四五六七八九十百]+[、.．]\s*/u;
const arabicNumberPattern = /^\d+[、.．]\s*/u;
const decimalNumberPattern = /^\d+\.\d+(?:\.\d+)*[、.．]?\s*/u;
const parentheticalPattern = /^[（(](?:[一二三四五六七八九十百]+|\d+)[）)]\s*/u;

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

function mapOutsideFences(lines, mapper) {
  let fence = null;

  return lines.map((line, index) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return line;
    }

    return fence === null ? mapper(line, index) : line;
  });
}

function normalizeHeadingLevels(source) {
  const lines = source.split('\n');
  const headings = [];

  mapOutsideFences(lines, (line) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/u);
    if (match) headings.push(match[2].trim());
    return line;
  });

  // Many existing study notes use “一、二、三 …” as H2 chapter sections
  // and Arabic-numbered items beneath them as H3. Preserve that semantic
  // relationship instead of merely clamping every heading into H2/H3.
  const usesChineseMajorSections = headings.some((text) => chineseMajorPattern.test(text));
  let changedHeadings = 0;

  const normalized = mapOutsideFences(lines, (line) => {
    const headingMatch = line.match(/^(#{1,6})(\s+)(.*)$/u);
    if (!headingMatch) return line;

    const currentLevel = headingMatch[1].length;
    const text = headingMatch[3].trim();
    let targetLevel = currentLevel === 1 ? 2 : currentLevel >= 4 ? 3 : currentLevel;

    if (chineseMajorPattern.test(text)) {
      targetLevel = 2;
    } else if (
      decimalNumberPattern.test(text)
      || parentheticalPattern.test(text)
      || (usesChineseMajorSections && arabicNumberPattern.test(text))
    ) {
      targetLevel = 3;
    }

    if (targetLevel === currentLevel) return line;

    changedHeadings += 1;
    return `${'#'.repeat(targetLevel)}${headingMatch[2]}${headingMatch[3]}`;
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
  console.error('Math supplement heading validation failed. Body headings must use the project H2/H3 hierarchy.');
  for (const file of changedFiles) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? 'Validated' : 'Normalized'} ${files.length} MDX files; ${changedFiles.length} files and ${changedHeadingCount} headings required changes.`);
}
