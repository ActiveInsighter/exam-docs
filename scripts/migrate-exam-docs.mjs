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

const DETAILS_PATTERN = /^<details>[ \t]*\n(?<body>[\s\S]*?)^<\/details>[ \t]*$/gm;
const QUESTION_START_PATTERN = /^[ \t]*\d+[.、)]\s+/gm;
const CHOICE_CONTAINER_OPEN = '<div className="choice-options">';
const CHOICE_ROW_OPEN = '<div className="choice-option-row">';
const DIV_CLOSE = '</div>';
const PLAIN_OPTION_PATTERN = /^[ \t]*(?<label>[A-D])(?<punctuation>[.．、:：])(?:[ \t]+(?<content>.*))?$/u;
const EXPLANATION_PATTERN = /^[ \t]*(?:\*\*解析\s*[：:]\s*\*\*|解析\s*[：:])[ \t]*/m;
const EXERCISE_ANSWER_PATTERN = /<div className="exercise-label-row">[ \t]*\n?[ \t]*<strong>答案\s*[：:]<\/strong>[ \t]*\n?[ \t]*<div className="exercise-label-body">(?<value>[\s\S]*?)<\/div>[ \t]*\n?[ \t]*<\/div>/u;
const EXERCISE_EXPLANATION_PATTERN = /<div className="exercise-label-row">[ \t]*\n?[ \t]*<strong>解析\s*[：:]<\/strong>[ \t]*\n?[ \t]*<div className="exercise-label-body">(?<value>[\s\S]*?)<\/div>[ \t]*\n?[ \t]*<\/div>/u;
const BOLD_ANSWER_PATTERN = /^[ \t]*\*\*答案\s*[：:]\s*\*\*(?<inline>[^\n]*)/m;
const PLAIN_ANSWER_PATTERN = /^[ \t]*答案\s*[：:](?<inline>[^\n]*)/m;

function createStats() {
  return {
    questions: 0,
    solutions: 0,
    answerMarkers: 0,
    choiceGroups: 0,
    options: 0,
    legacyChoiceRows: 0,
    unparsedQuestions: 0,
    unparsedSolutions: 0,
  };
}

function trimContent(value) {
  return value.replace(/^\s+|\s+$/gu, '');
}

function trimChoiceContent(value) {
  return trimContent(value)
    .replace(/(?:(?:&emsp;|&ensp;|&nbsp;){2,}|　{2,}|[ \t]{2,})$/u, '')
    .trim();
}

function nextNonWhitespaceIndex(source, start) {
  let index = start;
  while (index < source.length && /\s/u.test(source[index])) index += 1;
  return index;
}

function splitChoiceRow(content) {
  const labelPattern = /(?:^|(?:&emsp;){2,}\s*|(?:&ensp;){2,}\s*|(?:&nbsp;){2,}\s*|　{2,}|[ \t]{2,})\s*(?<label>[A-D])(?=(?:[.．、:：]|\s|$))/gu;
  const labels = [...content.matchAll(labelPattern)].map((match) => ({
    index: match.index + match[0].lastIndexOf(match.groups.label),
    label: match.groups.label,
  }));

  if (labels.length === 0) {
    return [trimContent(content)];
  }

  return labels
    .map((label, index) =>
      trimChoiceContent(content.slice(label.index, labels[index + 1]?.index ?? content.length)),
    )
    .filter(Boolean);
}

function renderChoiceGroup(options) {
  return [
    '<ExamChoices>',
    ...options.map((option) => renderMarkedContent('ExamOption', option)),
    '</ExamChoices>',
  ].join('\n');
}

function replaceChoiceContainers(source, stats) {
  let cursor = 0;
  let output = '';

  while (cursor < source.length) {
    const openIndex = source.indexOf(CHOICE_CONTAINER_OPEN, cursor);
    if (openIndex < 0) {
      output += source.slice(cursor);
      break;
    }

    output += source.slice(cursor, openIndex);
    let scanIndex = openIndex + CHOICE_CONTAINER_OPEN.length;
    const rows = [];

    while (true) {
      scanIndex = nextNonWhitespaceIndex(source, scanIndex);

      if (source.startsWith(CHOICE_ROW_OPEN, scanIndex)) {
        const rowContentStart = scanIndex + CHOICE_ROW_OPEN.length;
        const rowCloseIndex = source.indexOf(DIV_CLOSE, rowContentStart);
        if (rowCloseIndex < 0) {
          throw new Error('Unclosed legacy choice row');
        }

        rows.push(source.slice(rowContentStart, rowCloseIndex));
        scanIndex = rowCloseIndex + DIV_CLOSE.length;
        continue;
      }

      if (source.startsWith(DIV_CLOSE, scanIndex)) {
        scanIndex += DIV_CLOSE.length;
        break;
      }

      throw new Error('Unexpected content inside a legacy choice container');
    }

    const options = rows.flatMap(splitChoiceRow);
    if (options.length === 0) {
      throw new Error('Legacy choice container has no options');
    }

    stats.choiceGroups += 1;
    stats.legacyChoiceRows += rows.length;
    stats.options += options.length;
    output += renderChoiceGroup(options);
    cursor = scanIndex;
  }

  return output;
}

function getFenceState(lines) {
  let fenced = false;

  return lines.map((line) => {
    const wasFenced = fenced;
    const marker = line.match(/^[ \t]*(`{3,}|~{3,})/u);
    if (marker) fenced = !fenced;
    return wasFenced;
  });
}

function parsePlainOption(line) {
  return line.match(PLAIN_OPTION_PATTERN);
}

function findNextPlainOption(lines, fenceState, start, expectedLabel) {
  for (let index = start; index < lines.length; index += 1) {
    if (fenceState[index]) continue;

    const match = parsePlainOption(lines[index]);
    if (!match) continue;

    return {
      index,
      match,
      isExpected: match.groups.label === expectedLabel,
    };
  }

  return null;
}

function optionText(lines, start, end) {
  return trimContent(lines.slice(start, end).join('\n'));
}

function replacePlainChoiceGroups(source, stats) {
  const lines = source.split('\n');
  const fenceState = getFenceState(lines);
  const output = [];

  for (let index = 0; index < lines.length;) {
    if (fenceState[index]) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const firstMatch = parsePlainOption(lines[index]);
    if (!firstMatch || firstMatch.groups.label !== 'A') {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const optionStarts = [{ index, match: firstMatch }];
    let searchStart = index + 1;
    let failed = false;

    for (const expectedLabel of ['B', 'C', 'D']) {
      const next = findNextPlainOption(lines, fenceState, searchStart, expectedLabel);
      if (!next || !next.isExpected) {
        failed = true;
        break;
      }

      optionStarts.push(next);
      searchStart = next.index + 1;
    }

    if (failed) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const options = optionStarts.map((option, optionIndex) => {
      const end = optionStarts[optionIndex + 1]?.index ?? option.index + 1;
      return optionText(lines, option.index, end);
    });

    stats.choiceGroups += 1;
    stats.options += options.length;
    output.push(renderChoiceGroup(options));
    index = optionStarts.at(-1).index + 1;
  }

  return output.join('\n');
}

function normalizeExamOptionMarkup(source) {
  const withUnopenedTrailingDOptions = source.replace(
    /<ExamOption>D\.\s*\$?<\/ExamOption>\n<\/ExamChoices>\n(\\displaystyle[\s\S]*?)\n\$\$\n/g,
    (_, formula) =>
      '<ExamOption>\nD.\n\n$$\n'
      + formula
      + '\n$$\n</ExamOption>\n</ExamChoices>\n',
  );
  const withTrailingDOptions = withUnopenedTrailingDOptions.replace(
    /<ExamOption>D\.<\/ExamOption>\n<\/ExamChoices>\n(\$\$\n[\s\S]*?\n\$\$)\n/g,
    (_, formula) =>
      '<ExamOption>\nD.\n\n'
      + formula
      + '\n</ExamOption>\n</ExamChoices>\n',
  );

  return withTrailingDOptions.replace(
    /<ExamOption>([\s\S]*?)<\/ExamOption>/g,
    (full, content) => {
      if (!content.includes('\n')) return full;

      const trimmedContent = content.trim();
      const multilineInlineMath = trimmedContent.match(
        /^([A-D]\.)\s+\$\n([\s\S]*?)\n\$$/u,
      );
      const normalizedContent = multilineInlineMath
        ? multilineInlineMath[1]
          + '\n\n$$\n'
          + multilineInlineMath[2].trim()
          + '\n$$'
        : trimmedContent;

      return '<ExamOption>\n' + normalizedContent + '\n</ExamOption>';
    },
  );
}

function transformQuestion(source, stats) {
  const withContainerChoices = replaceChoiceContainers(source, stats);
  return replacePlainChoiceGroups(withContainerChoices, stats);
}

function parseAnswerSection(answerSection) {
  const exerciseAnswer = answerSection.match(EXERCISE_ANSWER_PATTERN);
  if (exerciseAnswer) {
    const continuation = answerSection.slice(exerciseAnswer.index + exerciseAnswer[0].length);
    return {
      answer: trimContent(`${exerciseAnswer.groups.value}\n${continuation}`),
      found: true,
    };
  }

  const answerMarker = answerSection.match(BOLD_ANSWER_PATTERN) ?? answerSection.match(PLAIN_ANSWER_PATTERN);
  if (!answerMarker) return { answer: null, found: false };

  const continuation = answerSection.slice(answerMarker.index + answerMarker[0].length);
  return {
    answer: trimContent(`${answerMarker.groups.inline}\n${continuation}`),
    found: true,
  };
}

function parseSolutionBody(body, stats) {
  const withoutSummary = body.replace(/^\s*<summary>[\s\S]*?<\/summary>/u, '').trim();
  const textExplanation = withoutSummary.match(EXPLANATION_PATTERN);
  const exerciseExplanation = withoutSummary.match(EXERCISE_EXPLANATION_PATTERN);
  const explanationMarker = [textExplanation, exerciseExplanation]
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)[0];

  if (!explanationMarker) {
    stats.unparsedSolutions += 1;
    return { answer: null, explanation: withoutSummary };
  }

  const answerSection = withoutSummary.slice(0, explanationMarker.index).trim();
  const explanation = exerciseExplanation && explanationMarker === exerciseExplanation
    ? trimContent(
      `${exerciseExplanation.groups.value}\n${withoutSummary.slice(
        explanationMarker.index + explanationMarker[0].length,
      )}`,
    )
    : withoutSummary.slice(explanationMarker.index + explanationMarker[0].length).trim();
  const parsedAnswer = parseAnswerSection(answerSection);

  if (!parsedAnswer.found) stats.unparsedSolutions += 1;
  else stats.answerMarkers += 1;

  return {
    answer: parsedAnswer.answer,
    explanation,
  };
}

function renderMarkedContent(tagName, content) {
  if (!content.includes('\n')) return `<${tagName}>${content}</${tagName}>`;
  return `<${tagName}>\n${content}\n</${tagName}>`;
}

function renderSolution(solution) {
  const lines = ['<ExamSolution>'];
  if (solution.answer !== null) {
    lines.push('', renderMarkedContent('ExamAnswer', solution.answer));
  }
  lines.push(
    '',
    '<ExamExplanation>',
    solution.explanation,
    '</ExamExplanation>',
    '',
    '</ExamSolution>',
  );
  return lines.join('\n');
}

function getQuestionStart(source, detailsIndex) {
  const beforeDetails = source.slice(0, detailsIndex);
  const previousDetailsEnd = beforeDetails.lastIndexOf('</details>');
  const segmentStart = previousDetailsEnd < 0 ? 0 : previousDetailsEnd + '</details>'.length;
  const segment = source.slice(segmentStart, detailsIndex);
  const starts = [...segment.matchAll(QUESTION_START_PATTERN)];
  if (starts.length === 0) return null;
  return segmentStart + starts.at(-1).index;
}

export function migrateExamDocument(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replace(/\r\n/g, '\n');
  const stats = createStats();
  const details = [...normalized.matchAll(DETAILS_PATTERN)];
  let migrated = normalized;

  for (let index = details.length - 1; index >= 0; index -= 1) {
    const detail = details[index];
    const detailsStart = detail.index;
    const detailsEnd = detailsStart + detail[0].length;
    const questionStart = getQuestionStart(normalized, detailsStart);

    if (questionStart === null) {
      stats.unparsedQuestions += 1;
      continue;
    }

    const question = normalized.slice(questionStart, detailsStart).trim();
    const transformedQuestion = transformQuestion(question, stats);
    const solution = parseSolutionBody(detail.groups.body, stats);
    const replacement = [
      '<ExamQuestion>',
      '',
      transformedQuestion,
      '',
      renderSolution(solution),
      '',
      '</ExamQuestion>',
    ].join('\n');

    migrated = `${migrated.slice(0, questionStart)}${replacement}${migrated.slice(detailsEnd)}`;
    stats.questions += 1;
    stats.solutions += 1;
  }

  return {
    source: normalizeExamOptionMarkup(migrated).replace(/\n/g, newline),
    stats,
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
  const totalStats = createStats();

  for (const file of files) {
    const original = await readFile(file, 'utf8');
    const result = migrateExamDocument(original);

    for (const key of Object.keys(totalStats)) totalStats[key] += result.stats[key];

    if (result.stats.unparsedQuestions > 0 || result.stats.unparsedSolutions > 0) {
      throw new Error(`Could not parse ${relative(process.cwd(), file)}`);
    }

    if (result.source === original) continue;
    changedFiles += 1;
    if (shouldWrite && !checkOnly) await writeFile(file, result.source, 'utf8');
  }

  const mode = checkOnly ? 'Checked' : shouldWrite ? 'Migrated' : 'Planned';
  console.log(
    `${mode} ${files.length} files: ${changedFiles} changed, `
      + `${totalStats.questions} questions, ${totalStats.options} options, `
      + `${totalStats.answerMarkers} answer markers.`,
  );

  if (checkOnly && changedFiles > 0) {
    console.error('Legacy exam details remain; run the migration with --write first.');
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) await runCli();
