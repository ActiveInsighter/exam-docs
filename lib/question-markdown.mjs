/** Export authored question props without evaluating MDX/JavaScript. */
const QUESTION_TYPES = {
  single: '单选题', multiple: '多选题', boolean: '判断题', blank: '填空题', essay: '解答题',
};

// Locate a tag's closing >, respecting strings and nested prop expressions.
function readTag(source, start) {
  const match = /^<(\/)?([A-Za-z][\w.:-]*)(?=[\s/>])/u.exec(source.slice(start));
  if (!match) return null;
  let quote = null;
  let depth = 0;
  for (let end = start + match[0].length; end < source.length; end += 1) {
    const character = source[end];
    if (quote) {
      if (character === '\\') end += 1;
      else if (character === quote) quote = null;
    } else if ('"\'`'.includes(character)) quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === '>' && depth === 0) {
      return {
        name: match[2], close: Boolean(match[1]), end: end + 1,
        attributes: source.slice(start + match[0].length, end).replace(/\/\s*$/u, ''),
      };
    }
  }
  return null;
}

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/giu, (entity, key) => {
    if (key.startsWith('#')) {
      const point = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[key.toLowerCase()] ?? entity;
  });
}

function literal(expression) {
  try { return JSON.parse(expression); } catch { /* Only literal strings below are also accepted. */ }
  // Single-quoted JS strings are common in authored MDX; never run expressions.
  if (/^'(?:[^'\\]|\\.)*'$/su.test(expression)) {
    return expression.slice(1, -1).replace(/\\(u[\da-f]{4}|x[\da-f]{2}|[\\'"nrtbfv])/giu, (_, escape) => {
      if (/^[ux]/iu.test(escape)) return String.fromCharCode(parseInt(escape.slice(1), 16));
      return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' }[escape] ?? escape;
    });
  }
  return undefined;
}

function readAttributes(source) {
  const attributes = {};
  let offset = 0;
  while (offset < source.length) {
    const match = /^\s*([\w:-]+)(?:\s*=\s*)?/u.exec(source.slice(offset));
    if (!match) { offset += 1; continue; }
    offset += match[0].length;
    const name = match[1];
    if (!match[0].includes('=')) { attributes[name] = true; continue; }
    const first = source[offset];
    if (first === '"' || first === "'") {
      const end = source.indexOf(first, offset + 1);
      if (end === -1) break;
      attributes[name] = decodeEntities(source.slice(offset + 1, end));
      offset = end + 1;
    } else if (first === '{') {
      let depth = 1;
      let quote = null;
      let end = offset + 1;
      for (; end < source.length && depth; end += 1) {
        const character = source[end];
        if (quote) {
          if (character === '\\') end += 1;
          else if (character === quote) quote = null;
        } else if ('"\'`'.includes(character)) quote = character;
        else if (character === '{') depth += 1;
        else if (character === '}') depth -= 1;
      }
      attributes[name] = literal(source.slice(offset + 1, end - 1).trim());
      offset = end;
    } else {
      // Invalid/unquoted values must not be mistaken for later attributes.
      const value = /^\S*/u.exec(source.slice(offset))[0];
      offset += value.length;
    }
  }
  return attributes;
}

function text(value) {
  return String(value).replace(/\s+/gu, ' ').trim().replace(/[\\`*_[\]<>]/gu, '\\$&');
}

function tagsOf(value) {
  const tags = typeof value === 'string' ? value.split(/[,，、]/u) : value;
  return Array.isArray(tags) ? [...new Set(tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))] : [];
}

function answerOf(question) {
  if (question.correct.length) return question.correct.join('');
  if (typeof question.answer === 'boolean') return question.answer ? '正确' : '错误';
  return question.blanks.join('；');
}

/**
 * Convert question markers before the general MDX wrapper cleanup. A small
 * quote/brace-aware scanner handles multiline props and inline markers while
 * leaving fenced/inline code and unrelated components untouched.
 */
export function exportQuestionMarkdown(source) {
  const output = [];
  let counter = 0;
  let question = null;
  let fence = null;
  for (let offset = 0; offset < source.length;) {
    if (offset === 0 || source[offset - 1] === '\n') {
      const end = source.indexOf('\n', offset);
      const lineEnd = end < 0 ? source.length : end + 1;
      const line = source.slice(offset, lineEnd);
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)/u.exec(line);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        output.push(line); offset = lineEnd; continue;
      }
      if (marker) { fence = marker[1]; output.push(line); offset = lineEnd; continue; }
    }
    if (source.startsWith('{/*', offset)) {
      const end = source.indexOf('*/}', offset + 3);
      if (end >= 0) { output.push(source.slice(offset, end + 3)); offset = end + 3; continue; }
    }
    if (source[offset] === '`') {
      const marker = /^`+/u.exec(source.slice(offset))[0];
      // Code spans require a run of exactly the same length, and cannot
      // cross a blank paragraph. An unmatched backtick in prose must not hide
      // later questions or consume part of a fenced code block.
      const paragraphBreak = source.slice(offset).search(/\r?\n[ \t]*\r?\n/u);
      const limit = paragraphBreak < 0 ? source.length : offset + paragraphBreak;
      const runs = /`+/gu;
      runs.lastIndex = offset + marker.length;
      let end = -1;
      for (let run; (run = runs.exec(source)) && run.index < limit;) {
        if (run[0].length === marker.length) { end = run.index; break; }
      }
      if (end >= 0) {
        output.push(source.slice(offset, end + marker.length)); offset = end + marker.length;
      } else {
        output.push(marker); offset += marker.length;
      }
      continue;
    }
    const tag = source[offset] === '<' && source[offset - 1] !== '\\' ? readTag(source, offset) : null;
    if (!tag) {
      let end = offset + 1;
      while (end < source.length && !'<`{\n'.includes(source[end])) end += 1;
      output.push(source.slice(offset, end)); offset = end; continue;
    }
    // Skip entire unrelated tags, including their prop strings/expressions.
    // Otherwise JSX examples inside a chart's props could become real questions.
    if (!['Question', 'Option', 'Solution', 'Blank', 'ExamArticle', 'Evidence', 'Callout', 'Card', 'Tab', 'Accordion'].includes(tag.name)) {
      output.push(source.slice(offset, tag.end)); offset = tag.end; continue;
    }
    const props = readAttributes(tag.attributes);
    let replacement;
    if (tag.name === 'Question') {
      if (tag.close) {
        const answer = question && !question.printed ? answerOf(question) : '';
        replacement = `${answer ? `\n\n**答案：** ${answer}` : ''}\n\n`;
        question = null;
      } else {
        let number = null;
        if (props.number !== false) {
          if (props.number !== undefined) {
            number = props.number;
            if (String(number).trim() && Number.isInteger(Number(number))) counter = Number(number);
          } else number = ++counter;
        }
        question = { correct: [], blanks: [], optionCount: 0, answer: props.answer, printed: false };
        const metadata = [`**题目${number === null ? '' : ` ${text(number)}`}**`];
        if (props.id !== undefined) metadata.push(`**题目 ID：** ${text(props.id)}`);
        if (props.type !== undefined) metadata.push(`**题型：** ${text(QUESTION_TYPES[props.type] ?? props.type)} (${text(props.type)})`);
        const tags = tagsOf(props.tags);
        if (tags.length) metadata.push(`**标签：** ${tags.map(text).join('；')}`);
        if (props.points !== undefined) metadata.push(`**分值：** ${text(props.points)}`);
        replacement = `\n\n${metadata.join('\n\n')}\n\n`;
      }
    } else if (tag.name === 'Option' && question) {
      if (tag.close) replacement = '\n';
      else {
        const letter = String.fromCharCode(65 + question.optionCount++);
        if (props.correct === true) question.correct.push(letter);
        replacement = `\n\n${letter}. `;
        // Keep a multiline option's first paragraph on the same line as A.
        const whitespace = /^\s*/u.exec(source.slice(tag.end))[0];
        tag.end += whitespace.length;
      }
    } else if (tag.name === 'Solution' && question) {
      const answer = answerOf(question);
      replacement = tag.close ? '\n\n' : `\n\n${answer ? `**答案：** ${answer}\n\n` : ''}**解析：**\n\n`;
      if (!tag.close) question.printed = true;
    } else if (tag.name === 'Blank' && question) {
      const aliases = Array.isArray(props.aliases) ? props.aliases.filter((alias) => typeof alias === 'string') : [];
      if (props.answer !== undefined) question.blanks.push(`${text(props.answer)}${aliases.length ? `（亦可：${aliases.map(text).join('、')}）` : ''}`);
      replacement = '____';
    } else if (tag.name === 'Evidence') {
      replacement = '';
    } else if (tag.name === 'ExamArticle') {
      const metadata = [];
      if (!tag.close) {
        if (props.title !== undefined) metadata.push(`**${text(props.title)}**`);
        if (props.titleTranslation !== undefined) metadata.push(`**译题：** ${text(props.titleTranslation)}`);
        if (props.source !== undefined) metadata.push(`**来源：** ${text(props.source)}`);
      }
      replacement = `\n\n${metadata.join('\n\n')}\n\n`;
    }
    if (['Callout', 'Card', 'Tab', 'Accordion'].includes(tag.name) && !tag.close && !/\/\s*>$/u.test(source.slice(offset, tag.end))) {
      const label = props.title ?? (tag.name === 'Tab' ? props.value : undefined);
      if (label !== undefined) {
        replacement = `**${text(label)}** `;
        if (props.description !== undefined) replacement += `\n\n${text(props.description)}\n\n`;
      }
    }
    output.push(replacement ?? source.slice(offset, tag.end));
    offset = tag.end;
  }
  return output.join('');
}
