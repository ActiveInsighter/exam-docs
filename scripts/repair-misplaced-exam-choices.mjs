import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const EXAM_DOCUMENT_ROOTS = [
  '408模拟选择题',
  '408真题',
  '李正元练习题',
  '数学真题',
  '张宇1000题',
];

const QUESTION_PATTERN = /<ExamQuestion>(?<body>[\s\S]*?)<\/ExamQuestion>/gu;
const SOLUTION_OPEN = '<ExamSolution>';
const EXPLANATION_PATTERN = /<ExamExplanation>(?<body>[\s\S]*?)<\/ExamExplanation>/u;
const ANSWER_PATTERN = /<ExamAnswer>(?<body>[\s\S]*?)<\/ExamAnswer>/u;
const EMPTY_CHOICE_BLANK_PATTERN = /[（(][ \t　]*[）)]/u;
const SINGLE_CHOICE_ANSWER_PATTERN = /^[\s$*_`]*[A-D][。．.、：:\s$*_`]*$/u;
const CHOICE_LABEL_PATTERN = /(?:^|\n|(?:&emsp;){2,}\s*|(?:&ensp;){2,}\s*|(?:&nbsp;){2,}\s*|　{2,}|[ \t]{2,})\s*(?<label>[A-D])(?<punctuation>[.．、:：])(?=\s|$|[$<`*_\\])/gmu;

function trimContent(value) {
  return value.replace(/^\s+|\s+$/gu, '');
}

function renderMarkedContent(tagName, content) {
  if (!content.includes('\n')) return `<${tagName}>${content}</${tagName}>`;
  return `<${tagName}>\n${content}\n</${tagName}>`;
}

function renderChoiceGroup(options) {
  return [
    '<ExamChoices>',
    ...options.map((option) => renderMarkedContent('ExamOption', option)),
    '</ExamChoices>',
  ].join('\n');
}

function looksLikeChoiceQuestion(questionBody, solutionBody) {
  if (questionBody.includes('<ExamChoices>')) return false;

  const questionTail = questionBody.slice(-1200);
  if (EMPTY_CHOICE_BLANK_PATTERN.test(questionTail)) return true;

  const answer = solutionBody.match(ANSWER_PATTERN)?.groups?.body;
  return answer ? SINGLE_CHOICE_ANSWER_PATTERN.test(trimContent(answer)) : false;
}

function collectChoiceLabels(source) {
  return [...source.matchAll(CHOICE_LABEL_PATTERN)].map((match) => {
    const label = match.groups.label;
    const labelOffset = match[0].lastIndexOf(label);
    return {
      label,
      index: match.index + labelOffset,
    };
  });
}

function findTrailingChoiceGroup(explanation) {
  const labels = collectChoiceLabels(explanation);

  for (let start = labels.length - 4; start >= 0; start -= 1) {
    const group = labels.slice(start, start + 4);
    if (group.map((item) => item.label).join('') !== 'ABCD') continue;
    if (start + 4 !== labels.length) continue;

    const options = group.map((item, index) => {
      const end = group[index + 1]?.index ?? explanation.length;
      return trimContent(explanation.slice(item.index, end));
    });

    if (options.some((option, index) => !new RegExp(`^${'ABCD'[index]}[.．、:：]`, 'u').test(option))) {
      continue;
    }

    if (options.some((option) => option.replace(/^[A-D][.．、:：]\s*/u, '').trim().length === 0)) {
      continue;
    }

    return {
      start: group[0].index,
      options,
    };
  }

  return null;
}

function repairQuestionBody(body) {
  const solutionStart = body.indexOf(SOLUTION_OPEN);
  if (solutionStart < 0) return null;

  const questionBody = body.slice(0, solutionStart);
  const solutionBody = body.slice(solutionStart);
  if (!looksLikeChoiceQuestion(questionBody, solutionBody)) return null;

  const explanationMatch = solutionBody.match(EXPLANATION_PATTERN);
  if (!explanationMatch) return null;

  const choiceGroup = findTrailingChoiceGroup(explanationMatch.groups.body);
  if (!choiceGroup) return null;

  const cleanedExplanation = explanationMatch.groups.body.slice(0, choiceGroup.start).trimEnd();
  const repairedExplanation = `<ExamExplanation>\n${cleanedExplanation.trim()}\n</ExamExplanation>`;
  const repairedSolution = solutionBody.replace(explanationMatch[0], repairedExplanation);
  const repairedQuestion = [
    questionBody.trimEnd(),
    '',
    renderChoiceGroup(choiceGroup.options),
    '',
    repairedSolution.trimStart(),
  ].join('\n');

  return {
    body: repairedQuestion,
    options: choiceGroup.options.length,
  };
}

export function repairMisplacedExamChoices(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replace(/\r\n/g, '\n');
  let repairedGroups = 0;
  let repairedOptions = 0;

  const repaired = normalized.replace(QUESTION_PATTERN, (full, _body, _offset, _source, groups) => {
    const result = repairQuestionBody(groups.body);
    if (!result) return full;

    repairedGroups += 1;
    repairedOptions += result.options;
    return `<ExamQuestion>${result.body}</ExamQuestion>`;
  });

  return {
    source: repaired.replace(/\n/g, newline),
    stats: {
      repairedGroups,
      repairedOptions,
    },
  };
}

async function collectDocumentFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectDocumentFiles(path));
    else if (entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name))) files.push(path);
  }

  return files.sort();
}

async function runCli() {
  const root = join(process.cwd(), 'content', 'docs');
  const checkOnly = process.argv.includes('--check');
  const shouldWrite = process.argv.includes('--write');
  const files = [];

  for (const documentRoot of EXAM_DOCUMENT_ROOTS) {
    files.push(...await collectDocumentFiles(join(root, documentRoot)));
  }

  let changedFiles = 0;
  let repairedGroups = 0;
  let repairedOptions = 0;

  for (const file of files) {
    const original = await readFile(file, 'utf8');
    const result = repairMisplacedExamChoices(original);
    repairedGroups += result.stats.repairedGroups;
    repairedOptions += result.stats.repairedOptions;

    if (result.source === original) continue;
    changedFiles += 1;
    if (shouldWrite && !checkOnly) await writeFile(file, result.source, 'utf8');
  }

  const mode = checkOnly ? 'Checked' : shouldWrite ? 'Repaired' : 'Planned';
  console.log(
    `${mode} ${files.length} files: ${changedFiles} changed, `
      + `${repairedGroups} choice groups and ${repairedOptions} options recovered.`,
  );

  if (checkOnly && changedFiles > 0) {
    console.error('Misplaced exam choices remain; run with --write first.');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) await runCli();
