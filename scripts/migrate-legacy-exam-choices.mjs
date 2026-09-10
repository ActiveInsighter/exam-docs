import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('content/docs');
const CHECK_ONLY = process.argv.includes('--check');
const WRITE = process.argv.includes('--write');

if (CHECK_ONLY === WRITE) {
  throw new Error('Pass exactly one of --write or --check.');
}

const QUESTION_RE = /<ExamQuestion>([\s\S]*?)<\/ExamQuestion>/g;
const SOLUTION_MARKER = '<ExamSolution>';
const CHOICES_OPEN = '<ExamChoices>';
const CHOICES_CLOSE = '</ExamChoices>';
const LABEL_RE = /(^|\n[ \t]*|[ \t]{2,})([A-F])[.．、][ \t]*/gm;
const LOOSE_LABEL_RE = /(^|\s+)([A-F])[.．、][ \t]*/g;

async function collectMdxFiles(dir, output = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectMdxFiles(full, output);
    else if (entry.isFile() && entry.name.endsWith('.mdx')) output.push(full);
  }
  return output;
}

function isContiguousChoiceSequence(matches) {
  if (matches.length < 4 || matches[0].label !== 'A') return false;
  return matches.every((match, index) => match.label.charCodeAt(0) === 65 + index);
}

function collectMatches(text, regex) {
  regex.lastIndex = 0;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      prefixStart: match.index,
      labelStart: match.index + match[1].length,
      contentStart: regex.lastIndex,
      label: match[2],
    });
  }
  return matches;
}

function parseCandidate(text) {
  let matches = collectMatches(text, LABEL_RE);

  // Some historical files used a single ASCII space between choices. Only use
  // the looser matcher when the candidate begins at an A-label and produces a
  // complete contiguous A-D (or longer) sequence.
  if (!isContiguousChoiceSequence(matches)) {
    matches = collectMatches(text, LOOSE_LABEL_RE);
  }

  if (!isContiguousChoiceSequence(matches)) return null;

  // Do not consume prose before the first option. The A-label must begin a line
  // (allowing indentation) so ordinary prose containing A./B./C./D is ignored.
  const beforeA = text.slice(0, matches[0].labelStart);
  const lineStart = beforeA.lastIndexOf('\n') + 1;
  if (beforeA.slice(lineStart).trim() !== '') return null;

  const options = matches.map((match, index) => {
    const next = matches[index + 1];
    const end = next ? next.prefixStart : text.length;
    return {
      label: match.label,
      content: text.slice(match.contentStart, end).trim(),
    };
  });

  if (options.some((option) => option.content === '' || /<\/?Exam(?:Choices|Option)\b/.test(option.content))) {
    return null;
  }

  return { matches, options };
}

function renderChoices(options) {
  return [
    '<ExamChoices>',
    ...options.map(({ label, content }) => `<ExamOption>${label}. ${content}</ExamOption>`),
    '</ExamChoices>',
  ].join('\n');
}

function transformPrompt(prompt) {
  // Work paragraph-by-paragraph. Legacy choices are part of the question prompt
  // immediately before the blank line that precedes ExamSolution.
  const blocks = prompt.split(/(\n[ \t]*\n)/);
  let converted = 0;

  for (let i = 0; i < blocks.length; i += 2) {
    const block = blocks[i];
    if (!block || block.includes(CHOICES_OPEN) || block.includes(CHOICES_CLOSE)) continue;

    const parsed = parseCandidate(block);
    if (!parsed) continue;

    const first = parsed.matches[0];
    const prefix = block.slice(0, first.labelStart);
    const normalizedPrefix = prefix.endsWith('\n') ? prefix : `${prefix}\n`;
    blocks[i] = `${normalizedPrefix}${renderChoices(parsed.options)}`;
    converted += 1;
  }

  return { text: blocks.join(''), converted };
}

function transformDocument(source) {
  let converted = 0;
  const text = source.replace(QUESTION_RE, (full, body) => {
    const solutionIndex = body.indexOf(SOLUTION_MARKER);
    if (solutionIndex < 0) return full;

    const prompt = body.slice(0, solutionIndex);
    const rest = body.slice(solutionIndex);
    const result = transformPrompt(prompt);
    converted += result.converted;
    return `<ExamQuestion>${result.text}${rest}</ExamQuestion>`;
  });
  return { text, converted };
}

function countLegacyCandidates(source) {
  let count = 0;
  source.replace(QUESTION_RE, (_full, body) => {
    const solutionIndex = body.indexOf(SOLUTION_MARKER);
    if (solutionIndex < 0) return '';
    const prompt = body.slice(0, solutionIndex);
    const blocks = prompt.split(/\n[ \t]*\n/);
    for (const block of blocks) {
      if (block.includes(CHOICES_OPEN) || block.includes(CHOICES_CLOSE)) continue;
      if (parseCandidate(block)) count += 1;
    }
    return '';
  });
  return count;
}

const files = await collectMdxFiles(ROOT);
files.sort((a, b) => a.localeCompare(b, 'zh-CN'));

let changedFiles = 0;
let convertedGroups = 0;
let unresolvedGroups = 0;
const changed = [];
const unresolved = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');

  if (WRITE) {
    const result = transformDocument(source);
    if (result.converted > 0) {
      await writeFile(file, result.text, 'utf8');
      changedFiles += 1;
      convertedGroups += result.converted;
      changed.push(path.relative(process.cwd(), file));
    }
  }

  const current = WRITE ? await readFile(file, 'utf8') : source;
  const remaining = countLegacyCandidates(current);
  if (remaining > 0) {
    unresolvedGroups += remaining;
    unresolved.push(`${path.relative(process.cwd(), file)} (${remaining})`);
  }
}

if (WRITE) {
  console.log(`[legacy-choices] converted ${convertedGroups} choice group(s) in ${changedFiles} file(s).`);
  for (const file of changed) console.log(`[legacy-choices] changed ${file}`);
}

console.log(`[legacy-choices] scanned ${files.length} MDX file(s); unresolved legacy choice groups: ${unresolvedGroups}.`);
for (const item of unresolved) console.error(`[legacy-choices] unresolved ${item}`);

if (unresolvedGroups > 0) process.exitCode = 1;
