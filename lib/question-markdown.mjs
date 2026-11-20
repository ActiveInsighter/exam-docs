/** Export authored question and MDX component props without evaluating MDX/JavaScript. */
const QUESTION_TYPES = {
  single: '单选题', multiple: '多选题', boolean: '判断题', blank: '填空题', essay: '解答题',
};

const SUPPORTED_TAGS = new Set([
  'Question', 'Option', 'Solution', 'Blank',
  'Callout', 'Card', 'Cards', 'Step', 'Steps',
  'Tab', 'Tabs', 'CodeBlockTabs', 'CodeBlockTabsList', 'CodeBlockTabsTrigger', 'CodeBlockTabsContent',
  'Accordion', 'Accordions', 'Files', 'Folder', 'File',
]);

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
        name: match[2],
        close: Boolean(match[1]),
        selfClosing: /\/\s*$/u.test(source.slice(start + match[0].length, end)),
        end: end + 1,
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

function parseStringArray(expression) {
  if (Array.isArray(expression)) return expression.map(String);
  if (typeof expression !== 'string') return [];
  const trimmed = expression.trim();
  if (!trimmed.startsWith('[')) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* fall through to single-quoted items */ }
  const items = [];
  const itemPattern = /(['"])((?:\\.|(?!\1).)*)\1/gu;
  for (let m; (m = itemPattern.exec(trimmed));) {
    items.push(m[2].replace(/\\(.)/gu, '$1'));
  }
  return items;
}

function readAttributes(source) {
  const attributes = { _raw: {} };
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
      const rawExpr = source.slice(offset + 1, end - 1).trim();
      attributes._raw[name] = rawExpr;
      attributes[name] = literal(rawExpr);
      offset = end;
    } else {
      const value = /^\S*/u.exec(source.slice(offset))[0];
      offset += value.length;
    }
  }
  return attributes;
}

function text(value) {
  return String(value).replace(/\s+/gu, ' ').trim().replace(/[\\`*_[\]<>]/gu, '\\$&');
}

function plainMeta(value) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
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

function compactMetaJson(obj) {
  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    cleaned[k] = v;
  }
  return JSON.stringify(cleaned);
}

/**
 * Convert question and MDX component markers before the general MDX wrapper cleanup.
 */
export function exportQuestionMarkdown(source, { android = false } = {}) {
  const output = [];
  let counter = 0;
  let question = null;
  let fence = null;
  const tabsStack = [];
  let skipDepth = 0;

  for (let offset = 0; offset < source.length;) {
    if (offset === 0 || source[offset - 1] === '\n') {
      const end = source.indexOf('\n', offset);
      const lineEnd = end < 0 ? source.length : end + 1;
      const line = source.slice(offset, lineEnd);
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)/u.exec(line);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        if (skipDepth === 0) output.push(line);
        offset = lineEnd;
        continue;
      }
      if (marker) {
        fence = marker[1];
        if (skipDepth === 0) output.push(line);
        offset = lineEnd;
        continue;
      }
    }
    if (source.startsWith('{/*', offset)) {
      const end = source.indexOf('*/}', offset + 3);
      if (end >= 0) {
        if (skipDepth === 0) output.push(source.slice(offset, end + 3));
        offset = end + 3;
        continue;
      }
    }
    if (source[offset] === '`') {
      const marker = /^`+/u.exec(source.slice(offset))[0];
      const paragraphBreak = source.slice(offset).search(/\r?\n[ \t]*\r?\n/u);
      const limit = paragraphBreak < 0 ? source.length : offset + paragraphBreak;
      const runs = /`+/gu;
      runs.lastIndex = offset + marker.length;
      let end = -1;
      for (let run; (run = runs.exec(source)) && run.index < limit;) {
        if (run[0].length === marker.length) { end = run.index; break; }
      }
      if (end >= 0) {
        if (skipDepth === 0) output.push(source.slice(offset, end + marker.length));
        offset = end + marker.length;
      } else {
        if (skipDepth === 0) output.push(marker);
        offset += marker.length;
      }
      continue;
    }

    const tag = source[offset] === '<' && source[offset - 1] !== '\\' ? readTag(source, offset) : null;
    if (!tag) {
      let end = offset + 1;
      while (end < source.length && !'<`{\n'.includes(source[end])) end += 1;
      if (skipDepth === 0) output.push(source.slice(offset, end));
      offset = end;
      continue;
    }

    if (skipDepth > 0) {
      if (tag.name === 'CodeBlockTabsList' || tag.name === 'CodeBlockTabsTrigger') {
        if (tag.close) skipDepth -= 1;
        else if (!tag.selfClosing) skipDepth += 1;
      }
      offset = tag.end;
      continue;
    }

    if (!SUPPORTED_TAGS.has(tag.name)) {
      output.push(source.slice(offset, tag.end));
      offset = tag.end;
      continue;
    }

    const props = readAttributes(tag.attributes);
    let replacement;

    if (tag.name === 'Question') {
      if (tag.close) {
        const answer = question && !question.printed ? answerOf(question) : '';
        if (android) {
          replacement = `${answer ? `\n\n:::solution 参考答案\n${answer}\n:::\n\n` : '\n\n'}:::\n\n`;
        } else {
          replacement = `${answer ? `\n\n**答案：** ${answer}` : ''}\n\n`;
        }
        question = null;
      } else {
        let number = null;
        if (props.number !== false) {
          if (props.number !== undefined) {
            number = props.number;
            if (String(number).trim() && Number.isInteger(Number(number))) counter = Number(number);
          } else number = ++counter;
        }
        question = {
          id: props.id,
          type: props.type ?? 'single',
          number,
          tags: tagsOf(props.tags),
          points: props.points,
          correct: [],
          blanks: [],
          optionCount: 0,
          answer: props.answer,
          printed: false,
        };
        if (android) {
          const meta = compactMetaJson({
            id: typeof props.id === 'string' ? props.id : undefined,
            type: question.type,
            number: number === null ? undefined : String(number),
            tags: question.tags,
            points: props.points,
            answer: typeof props.answer === 'boolean' ? props.answer : undefined,
          });
          replacement = `\n\n:::question ${meta}\n\n`;
        } else {
          const metadata = [`**题目${number === null ? '' : ` ${text(number)}`}**`];
          if (props.id !== undefined) metadata.push(`**题目 ID：** ${text(props.id)}`);
          if (props.type !== undefined) metadata.push(`**题型：** ${text(QUESTION_TYPES[props.type] ?? props.type)} (${text(props.type)})`);
          if (question.tags.length) metadata.push(`**标签：** ${question.tags.map(text).join('；')}`);
          if (props.points !== undefined) metadata.push(`**分值：** ${text(props.points)}`);
          replacement = `\n\n${metadata.join('\n\n')}\n\n`;
        }
      }
    } else if (tag.name === 'Option' && question) {
      if (tag.close) {
        replacement = android ? '\n\n:::\n\n' : '\n';
      } else {
        const letter = String.fromCharCode(65 + question.optionCount++);
        const isCorrect = props.correct === true;
        if (isCorrect) question.correct.push(letter);
        if (android) {
          replacement = `\n\n:::option ${JSON.stringify({ label: letter, correct: isCorrect })}\n\n`;
        } else {
          replacement = `\n\n${letter}. `;
        }
        const whitespace = /^\s*/u.exec(source.slice(tag.end))[0];
        tag.end += whitespace.length;
      }
    } else if (tag.name === 'Solution' && question) {
      const answer = answerOf(question);
      if (android) {
        replacement = tag.close ? '\n\n:::\n\n'
          : `\n\n:::solution 参考答案与解析\n\n${answer ? `**答案：** ${answer}\n\n` : ''}`;
      } else {
        replacement = tag.close ? '\n\n' : `\n\n${answer ? `**答案：** ${answer}\n\n` : ''}**解析：**\n\n`;
      }
      if (!tag.close) question.printed = true;
    } else if (tag.name === 'Blank' && question) {
      const aliases = Array.isArray(props.aliases) ? props.aliases.filter((alias) => typeof alias === 'string') : [];
      if (props.answer !== undefined) question.blanks.push(`${text(props.answer)}${aliases.length ? `（亦可：${aliases.map(text).join('、')}）` : ''}`);
      if (android) {
        const blankMeta = compactMetaJson({
          answer: props.answer !== undefined ? String(props.answer) : '',
          aliases,
        });
        replacement = `[[blank:${blankMeta}]]`;
      } else {
        replacement = '____';
      }
    } else if (android) {
      if (tag.name === 'Callout' && !tag.selfClosing) {
        const types = {
          warn: 'warning', warning: 'warning', error: 'danger', danger: 'danger',
          idea: 'tip', tip: 'tip', success: 'tip', info: 'info', note: 'note',
        };
        const type = Object.hasOwn(types, props.type) ? types[props.type] : 'callout';
        const title = plainMeta(props.title);
        replacement = tag.close ? '\n\n:::\n\n' : `\n\n:::${type}${title ? ` ${title}` : ''}\n\n`;
      } else if (tag.name === 'Steps') {
        replacement = tag.close ? '\n\n:::\n\n' : '\n\n:::steps\n\n';
      } else if (tag.name === 'Step') {
        if (tag.close) {
          replacement = '\n\n:::\n\n';
        } else {
          const meta = compactMetaJson({
            title: plainMeta(props.title),
          });
          replacement = tag.selfClosing ? `\n\n:::step ${meta}\n\n:::\n\n` : `\n\n:::step ${meta}\n\n`;
        }
      } else if (tag.name === 'Cards') {
        replacement = tag.close ? '\n\n:::\n\n' : '\n\n:::cards\n\n';
      } else if (tag.name === 'Card') {
        if (tag.close) {
          replacement = '\n\n:::\n\n';
        } else {
          const meta = compactMetaJson({
            title: plainMeta(props.title),
            description: plainMeta(props.description),
            href: plainMeta(props.href),
            tone: plainMeta(props.tone),
            icon: plainMeta(props.icon),
          });
          replacement = tag.selfClosing
            ? `\n\n:::card ${meta}\n\n:::\n\n`
            : `\n\n:::card ${meta}\n\n`;
        }
      } else if (tag.name === 'Tabs' || tag.name === 'CodeBlockTabs') {
        if (tag.close) {
          tabsStack.pop();
          replacement = '\n\n:::\n\n';
        } else {
          const items = parseStringArray(props.items ?? props._raw?.items);
          tabsStack.push({ items, index: 0 });
          replacement = '\n\n:::tabs\n\n';
        }
      } else if (tag.name === 'CodeBlockTabsList' || tag.name === 'CodeBlockTabsTrigger') {
        if (!tag.close && !tag.selfClosing) skipDepth = 1;
        replacement = '';
      } else if (tag.name === 'Tab' || tag.name === 'CodeBlockTabsContent') {
        if (tag.close) {
          replacement = '\n\n:::\n\n';
        } else {
          const activeTabs = tabsStack.at(-1);
          const fallbackLabel = activeTabs ? activeTabs.items[activeTabs.index++] : undefined;
          const label = plainMeta(props.title ?? props.value ?? fallbackLabel) || 'Tab';
          replacement = `\n\n:::tab ${label}\n\n`;
        }
      } else if (tag.name === 'Accordions') {
        replacement = '';
      } else if (tag.name === 'Accordion') {
        if (tag.close) {
          replacement = '\n\n:::\n\n';
        } else {
          const title = plainMeta(props.title) || '展开详情';
          replacement = `\n\n:::accordion ${title}\n\n`;
        }
      } else if (tag.name === 'Files') {
        replacement = tag.close ? '\n\n:::\n\n' : '\n\n:::files\n\n';
      } else if (tag.name === 'Folder') {
        replacement = tag.close ? '' : `\n- 📁 **${plainMeta(props.name)}/**\n`;
      } else if (tag.name === 'File') {
        replacement = `\n- 📄 \`${plainMeta(props.name)}\`\n`;
      }
    } else if (['Callout', 'Card', 'Tab', 'Accordion'].includes(tag.name) && !tag.close && !tag.selfClosing) {
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
