import { createHash } from 'node:crypto';
import { parseMath } from './math-expression';

/*
 * Compile-time support for <Question> documents:
 *
 *  1. strips heading semantics inside questions (no TOC entries),
 *  2. validates the authored structure and fails the build on mistakes,
 *  3. adds the resolved display number (`index`) and a content hash
 *     (`revision`) to every question.
 *
 * It works on the MDX syntax tree, so answers are read from the structured
 * props (`correct`, `answer`, `type`) and never parsed out of prose.
 */

type AttributeValue =
  | string
  | null
  | undefined
  | { type: 'mdxJsxAttributeValueExpression'; value: string };

type MdxAttribute = {
  type: 'mdxJsxAttribute' | 'mdxJsxExpressionAttribute';
  name?: string;
  value?: AttributeValue;
};

type Position = { start: { offset?: number; line?: number }; end: { offset?: number } };

export type QuestionNode = {
  type?: string;
  name?: string | null;
  value?: string;
  depth?: number;
  attributes?: MdxAttribute[];
  children?: QuestionNode[];
  position?: Position;
};

export type QuestionProblem = { id: string | null; line: number | null; message: string };

const QUESTION_TYPES = ['single', 'multiple', 'boolean', 'blank', 'essay'] as const;
const CHOICE_TYPES = new Set(['single', 'multiple']);
const LEGACY_NAMES = new Set([
  'ExamQuestion',
  'ExamChoices',
  'ExamOption',
  'ExamAnswer',
  'ExamExplanation',
  'ExamSolution',
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const isJsx = (node: QuestionNode) =>
  node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
const isNamed = (node: QuestionNode, name: string) => isJsx(node) && node.name === name;
const isBlankText = (node: QuestionNode) =>
  node.type === 'text' && (node.value ?? '').trim() === '';

type Attribute = { present: boolean; text: string | null; literal: boolean };

/** `text` is the string value, or the source of a `{…}` expression. */
function readAttribute(node: QuestionNode, name: string): Attribute {
  const found = node.attributes?.find((attribute) => attribute.name === name);
  if (!found) return { present: false, text: null, literal: false };
  const value = found.value;
  if (value === null || value === undefined) return { present: true, text: null, literal: false };
  if (typeof value === 'string') return { present: true, text: value, literal: true };
  return { present: true, text: value.value.trim(), literal: false };
}

function setAttribute(node: QuestionNode, name: string, value: string) {
  const attributes = (node.attributes ??= []);
  const existing = attributes.find((attribute) => attribute.name === name);
  if (existing) existing.value = value;
  else attributes.push({ type: 'mdxJsxAttribute', name, value });
}

function lineOf(node: QuestionNode) {
  return node.position?.start.line ?? null;
}

/** Heading semantics inside a question would leak into the page TOC. */
function stripHeadings(node: QuestionNode, insideQuestion: boolean) {
  const inside = insideQuestion || isNamed(node, 'Question');
  if (inside && node.type === 'heading') {
    node.type = 'paragraph';
    delete node.depth;
  }
  for (const child of node.children ?? []) stripHeadings(child, inside);
}

function isOptionRun(node: QuestionNode) {
  if (node.type !== 'paragraph') return false;
  const parts = (node.children ?? []).filter((child) => !isBlankText(child));
  return parts.length > 0 && parts.every((part) => isNamed(part, 'Option'));
}

type Collected = {
  options: QuestionNode[];
  blanks: QuestionNode[];
  solutions: QuestionNode[];
  nestedQuestions: QuestionNode[];
  legacy: QuestionNode[];
  /** Options or blanks found somewhere they are not allowed. */
  misplaced: QuestionNode[];
};

function collect(question: QuestionNode): Collected {
  const found: Collected = {
    options: [],
    blanks: [],
    solutions: [],
    nestedQuestions: [],
    legacy: [],
    misplaced: [],
  };

  const visit = (node: QuestionNode, inSolution: boolean, inOption: boolean) => {
    for (const child of node.children ?? []) {
      if (isJsx(child) && child.name) {
        if (LEGACY_NAMES.has(child.name)) found.legacy.push(child);
        if (child.name === 'Question') {
          found.nestedQuestions.push(child);
          continue;
        }
        if (child.name === 'Option') {
          found.options.push(child);
          if (inSolution || inOption) found.misplaced.push(child);
        }
        if (child.name === 'Blank') {
          found.blanks.push(child);
          if (inSolution || inOption) found.misplaced.push(child);
        }
        if (child.name === 'Solution') found.solutions.push(child);
      }
      visit(
        child,
        inSolution || isNamed(child, 'Solution'),
        inOption || isNamed(child, 'Option'),
      );
    }
  };

  visit(question, false, false);
  return found;
}

function isTruthyFlag(attribute: Attribute) {
  return attribute.present && (attribute.text === null || attribute.text === 'true');
}

function validateQuestion(question: QuestionNode, seenIds: Set<string>): QuestionProblem[] {
  const problems: QuestionProblem[] = [];
  const idAttribute = readAttribute(question, 'id');
  const id = idAttribute.literal ? idAttribute.text : null;
  const report = (message: string, node: QuestionNode = question) =>
    problems.push({ id, line: lineOf(node), message });

  if (!id) report('缺少 id（必须是字符串，例如 id="408-ds-001"）');
  else if (!ID_PATTERN.test(id)) report(`id "${id}" 只能包含字母、数字、点、下划线和连字符`);
  else if (seenIds.has(id)) report(`id "${id}" 在同一文档中重复`);
  if (id) seenIds.add(id);

  const typeAttribute = readAttribute(question, 'type');
  const type = typeAttribute.literal ? typeAttribute.text : null;
  if (!type || !(QUESTION_TYPES as readonly string[]).includes(type)) {
    report(`type 必须是 ${QUESTION_TYPES.join(' / ')} 之一`);
    return problems;
  }

  const found = collect(question);
  for (const node of found.legacy) report(`旧组件 <${node.name}> 已移除，请改用 Question/Option/Blank/Solution`, node);
  for (const node of found.nestedQuestions) report('Question 不能嵌套', node);
  for (const node of found.misplaced) report(`<${node.name}> 不能放在 Solution 或 Option 内`, node);

  // Options: direct children of <Question>, one contiguous run.
  const direct = question.children ?? [];
  const runIndexes: number[] = [];
  direct.forEach((child, index) => {
    if (isNamed(child, 'Option') || isOptionRun(child)) runIndexes.push(index);
  });
  const directOptionCount = runIndexes.reduce((count, index) => {
    const child = direct[index];
    return count + (isNamed(child, 'Option') ? 1 : (child.children ?? []).filter((part) => isNamed(part, 'Option')).length);
  }, 0);
  if (directOptionCount !== found.options.length) {
    report('Option 必须是 Question 的直接子元素，不能嵌套在列表、引用或其他元素里');
  } else if (runIndexes.length > 0 && runIndexes.at(-1)! - runIndexes[0] + 1 !== runIndexes.length) {
    report('Option 必须连续放置，中间不要插入其他内容');
  }

  // Solution: at most one, a direct child, and the last thing in the question.
  if (found.solutions.length > 1) report('一道题只能有一个 Solution');
  if (found.solutions.length === 1) {
    const index = direct.indexOf(found.solutions[0]);
    if (index === -1) report('Solution 必须是 Question 的直接子元素');
    else if (direct.slice(index + 1).some((node) => !isBlankText(node))) {
      report('Solution 必须放在 Question 的最后');
    }
  }

  const answerAttribute = readAttribute(question, 'answer');
  if (type === 'boolean') {
    if (!answerAttribute.present || !['true', 'false'].includes(answerAttribute.text ?? '') || answerAttribute.literal) {
      report('判断题必须写 answer={true} 或 answer={false}');
    }
  } else if (answerAttribute.present) {
    report('只有判断题（boolean）使用 answer 属性');
  }

  if (CHOICE_TYPES.has(type)) {
    const correct = found.options.filter((option) => isTruthyFlag(readAttribute(option, 'correct')));
    for (const option of found.options) {
      const flag = readAttribute(option, 'correct');
      if (flag.present && !isTruthyFlag(flag)) report('correct 只能写成 correct 或 correct={true}', option);
    }
    if (found.options.length < 2) report('选择题至少需要 2 个 Option');
    if (type === 'single' && correct.length !== 1) {
      report(`单选题必须恰好有 1 个 correct 选项（当前 ${correct.length} 个）`);
    }
    if (type === 'multiple' && correct.length < 2) {
      report(`多选题至少需要 2 个 correct 选项（当前 ${correct.length} 个）`);
    }
  } else if (found.options.length > 0) {
    report(`${type} 题不能包含 Option`);
  }

  if (type === 'blank') {
    if (found.blanks.length === 0) report('填空题至少需要 1 个 <Blank answer="…" />');
    for (const blank of found.blanks) {
      const answer = readAttribute(blank, 'answer');
      if (!answer.present || answer.text === null || answer.text === '') {
        report('Blank 必须提供非空的 answer', blank);
      }
      const kind = readAttribute(blank, 'kind');
      if (kind.present && (!kind.literal || !['text', 'math'].includes(kind.text ?? ''))) {
        report('Blank 的 kind 只能是 "text" 或 "math"', blank);
      } else if (kind.text === 'math' && answer.text) {
        // Expression answers ({"…"} or {3}) are read the way the component reads them.
        const value = answer.literal ? answer.text : answer.text.replace(/^(["'`])(.*)\1$/su, '$2');
        const parsed = parseMath(value);
        if (!parsed.ok) report(`数学填空的答案「${value}」无法解析：${parsed.error}`, blank);
      }
      const tolerance = readAttribute(blank, 'tolerance');
      if (tolerance.present && (tolerance.literal || !Number.isFinite(Number(tolerance.text)))) {
        report('tolerance 必须是数字，例如 tolerance={0.01}', blank);
      }
    }
  } else if (found.blanks.length > 0) {
    report(`${type} 题不能包含 Blank`);
  }

  const tags = readAttribute(question, 'tags');
  if (tags.present) {
    const list = readTagList(tags);
    if (!list) report('tags 必须是字符串（逗号分隔）或字符串数组，例如 tags="2023 统考, 易错"');
    else if (list.length > 8) report('tags 最多 8 个');
    else if (list.some((tag) => tag.length > 32)) report('每个 tag 最多 32 个字符');
  }

  const points = readAttribute(question, 'points');
  if (points.present && (points.literal || !(Number(points.text) > 0))) {
    report('points 必须是正数，例如 points={10}');
  }

  const number = readAttribute(question, 'number');
  if (
    number.present &&
    !(number.text === 'false' && !number.literal) &&
    !(number.literal ? number.text !== '' : Number.isInteger(Number(number.text)))
  ) {
    report('number 必须是整数、字符串标签或 {false}');
  }

  return problems;
}

/** Tags from tags="a, b" or tags={["a", "b"]}; null when the value is not a list of strings. */
function readTagList(attribute: Attribute): string[] | null {
  if (attribute.text === null) return null;
  let values: unknown = attribute.text;
  if (!attribute.literal) {
    try {
      values = JSON.parse(attribute.text);
    } catch {
      return null;
    }
  }
  const list = typeof values === 'string' ? values.split(/[,，、]/u) : values;
  if (!Array.isArray(list) || list.some((value) => typeof value !== 'string')) return null;
  return (list as string[]).map((value) => value.trim()).filter(Boolean);
}

/** Finds every <Question> in document order. */
function findQuestions(node: QuestionNode, out: QuestionNode[] = []) {
  if (isNamed(node, 'Question')) {
    out.push(node);
    return out;
  }
  for (const child of node.children ?? []) findQuestions(child, out);
  return out;
}

/** Structural problems of every question in a tree; empty when valid. */
export function getQuestionProblems(tree: QuestionNode): QuestionProblem[] {
  const seenIds = new Set<string>();
  return findQuestions(tree).flatMap((question) => validateQuestion(question, seenIds));
}

function hashQuestion(question: QuestionNode, source: string) {
  const first = question.children?.[0]?.position?.start.offset;
  const last = question.children?.at(-1)?.position?.end.offset;
  const body = first === undefined || last === undefined ? '' : source.slice(first, last);
  const type = readAttribute(question, 'type').text ?? '';
  const answer = readAttribute(question, 'answer').text ?? '';
  return createHash('sha1').update(`${type}\n${answer}\n${body}`).digest('hex').slice(0, 8);
}

/** Display number of each question: document order, `number` restarts or hides. */
function assignDisplay(questions: QuestionNode[], source: string) {
  let counter = 0;
  for (const question of questions) {
    const number = readAttribute(question, 'number');
    if (number.present && number.text === 'false' && !number.literal) {
      // hidden: no index attribute, and the counter does not advance
    } else if (number.present && number.text !== null) {
      const numeric = Number(number.text);
      if (Number.isInteger(numeric) && (!number.literal || number.text.trim() !== '')) {
        counter = numeric;
        setAttribute(question, 'index', String(counter));
      } else {
        setAttribute(question, 'index', number.text);
      }
    } else {
      counter += 1;
      setAttribute(question, 'index', String(counter));
    }
    if (source) setAttribute(question, 'revision', hashQuestion(question, source));
  }
}

export function remarkQuestion() {
  return (tree: QuestionNode, file?: { path?: string; value?: unknown }) => {
    stripHeadings(tree, false);

    const problems = getQuestionProblems(tree);
    if (problems.length > 0) {
      const location = file?.path ?? '文档';
      const lines = problems.map(
        (problem) =>
          `  ${problem.line ? `第 ${problem.line} 行` : ''}${problem.id ? ` [${problem.id}]` : ''} ${problem.message}`,
      );
      throw new Error(`${location} 中的题目写法有误：\n${lines.join('\n')}`);
    }

    assignDisplay(findQuestions(tree), typeof file?.value === 'string' ? file.value : '');
  };
}
