/*
 * `**strong**` that CommonMark leaves as literal asterisks, and its repair.
 * See scripts/fix-strong-emphasis.mjs.
 *
 * micromark (remark, MDX) treats Unicode P and S categories as punctuation
 * and \s as whitespace; the start and end of a line count as whitespace.
 */

const PUNCTUATION = /[\p{P}\p{S}]/u;
const WHITESPACE = /\s/u;

/** Sentence punctuation that may leave the end of a strong run. */
const TRAILING = new Set('：:？?！!。，,；;、…'.split(''));
/** Paired marks that may leave a strong run together. */
const PAIRS = { '“': '”', '‘': '’', '「': '」', '『': '』', '《': '》', '（': '）', '(': ')', '【': '】', '"': '"' };

function classify(char) {
  if (char === '' || WHITESPACE.test(char)) return 'space';
  return PUNCTUATION.test(char) ? 'punct' : 'other';
}

/** Whether `**` between `before` and `after` can open (left-flanking) or close (right-flanking). */
export function flanking(before, after) {
  const b = classify(before);
  const a = classify(after);
  return {
    open: a !== 'space' && (a !== 'punct' || b !== 'other'),
    close: b !== 'space' && (b !== 'punct' || a !== 'other'),
  };
}

const parses = (before, inner, after) =>
  inner !== '' && flanking(before, inner[0]).open && flanking(inner.at(-1), after).close;

/** Ranges of a line that are code or inline maths, where `**` is not emphasis. */
function maskedRanges(line) {
  const ranges = [];
  const pattern = /(`+)[^`]*?\1|(?<!\\)\$(?!\$)(?:\\.|[^$\\])+?\$/gu;
  for (const match of line.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
  return ranges;
}

/** Positions of the `**` runs (exactly two asterisks) outside code and maths. */
function strongDelimiters(line) {
  const masked = maskedRanges(line);
  const positions = [];
  for (const match of line.matchAll(/(?<![*\\])\*\*(?!\*)/gu)) {
    if (!masked.some(([start, end]) => match.index >= start && match.index < end)) positions.push(match.index);
  }
  return positions;
}

/** Rewrites one strong run so it parses, keeping its text and emphasis. */
function repairRun(before, inner, after) {
  // Spaces just inside the markers ("** 答案**") are never meant.
  if (inner.trim() !== inner && parses(before, inner.trim(), after)) return `**${inner.trim()}**`;
  inner = inner.trim();
  let lead = '';
  let core = inner;
  let tail = '';
  while (core.length > 1 && TRAILING.has(core.at(-1))) {
    tail = core.at(-1) + tail;
    core = core.slice(0, -1);
  }
  const close = PAIRS[core[0]];
  if (close && core.length > 2 && core.at(-1) === close && !core.slice(1, -1).includes(core[0])) {
    lead = core[0];
    tail = close + tail;
    core = core.slice(1, -1);
  }
  const outerBefore = lead ? lead.at(-1) : before;
  const outerAfter = tail ? tail[0] : after;
  if ((lead || tail) && parses(outerBefore, core, outerAfter)) {
    return `${lead}**${core}**${tail}`;
  }
  return `<strong>${inner}</strong>`;
}

/**
 * Repairs every `**…**` run on a line that would not parse. Runs pair up in
 * order on their line; a line with an odd number is left alone.
 */
export function fixStrongEmphasis(source) {
  const lines = source.split('\n');
  const changes = [];
  let fence = null;
  let displayMath = false;
  let frontmatter = lines[0] === '---';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (frontmatter) {
      if (index > 0 && trimmed === '---') frontmatter = false;
      continue;
    }
    const fenceMatch = /^(`{3,}|~{3,})/u.exec(trimmed);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    if (trimmed.startsWith('$$')) {
      const closesHere = trimmed.length > 2 && trimmed.endsWith('$$');
      if (!closesHere) displayMath = !displayMath;
      continue;
    }
    if (displayMath || !line.includes('**')) continue;

    const positions = strongDelimiters(line);
    if (positions.length < 2 || positions.length % 2 === 1) continue;

    let output = '';
    let cursor = 0;
    for (let pair = 0; pair < positions.length; pair += 2) {
      const open = positions[pair];
      const close = positions[pair + 1];
      const before = line[open - 1] ?? '';
      const inner = line.slice(open + 2, close);
      const after = line[close + 2] ?? '';
      if (inner.trim() === '' || parses(before, inner, after)) continue;
      const replacement = repairRun(before, inner, after);
      output += line.slice(cursor, open) + replacement;
      cursor = close + 2;
      changes.push({ line: index + 1, before: `${before}**${inner}**${after}`, after: `${before}${replacement}${after}` });
    }
    if (cursor > 0) lines[index] = output + line.slice(cursor);
  }

  return { text: lines.join('\n'), changes };
}
