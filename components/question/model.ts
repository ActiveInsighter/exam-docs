import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Blank, Option, Solution, type BlankProps, type OptionProps } from './parts';
import {
  getOptionLetter,
  inferBlankKind,
  type BlankKind,
  type BlankSpec,
  type GradingSpec,
  type QuestionType,
} from './grading';

/*
 * Server-safe reading of an authored <Question>. Everything is derived from
 * the component props (type, <Option correct>, <Blank answer>), never from
 * rendered text, so a document states each fact exactly once.
 */

type WithChildren = { children?: ReactNode };

export type ChoiceOptionModel = {
  /** Stable key used for selection and grading (A, B, …). */
  label: string;
  content: ReactNode;
};

/** Stem spacing, shared by the question in the page and in its solution sheet. */
export const questionStemClassName = '[&>:first-child]:mt-0! [&>:last-child]:mb-0! [&>p]:my-2.5';

export function isWhitespaceNode(node: ReactNode) {
  return typeof node === 'string' && node.trim() === '';
}

export function hasContent(node: ReactNode) {
  return node !== null && node !== undefined && node !== false && node !== '';
}

function isElementOf<P>(node: ReactNode, type: unknown): node is ReactElement<P> {
  return isValidElement(node) && node.type === type;
}

export const isOption = (node: ReactNode) => isElementOf<OptionProps>(node, Option);
export const isSolution = (node: ReactNode) => isElementOf<WithChildren>(node, Solution);
export const isBlank = (node: ReactNode) => isElementOf<BlankProps>(node, Blank);

/**
 * Consecutive single-line <Option> tags may reach the component wrapped in a
 * paragraph; unwrap those so authors never have to care.
 */
function isOptionRun(node: ReactNode): node is ReactElement<WithChildren> {
  if (!isValidElement<WithChildren>(node) || typeof node.type !== 'string') return false;
  const parts = Children.toArray(node.props.children).filter((part) => !isWhitespaceNode(part));
  return parts.length > 0 && parts.every(isOption);
}

export type SplitQuestion = {
  /** Stem nodes in document order; options are replaced by one marker slot. */
  stem: ReactNode[];
  options: ReactElement<OptionProps>[];
  /** Index in `stem` where the option group belongs, or -1. */
  optionSlot: number;
  solution: ReactElement<WithChildren> | null;
};

export function splitQuestion(children: ReactNode): SplitQuestion {
  const stem: ReactNode[] = [];
  const options: ReactElement<OptionProps>[] = [];
  let optionSlot = -1;
  let solution: ReactElement<WithChildren> | null = null;

  for (const node of Children.toArray(children)) {
    if (isSolution(node)) {
      solution ??= node as ReactElement<WithChildren>;
      continue;
    }

    const run = isOption(node)
      ? [node as ReactElement<OptionProps>]
      : isOptionRun(node)
        ? (Children.toArray(node.props.children).filter(isOption) as ReactElement<OptionProps>[])
        : null;

    if (run) {
      if (optionSlot === -1) {
        optionSlot = stem.length;
        stem.push(null);
      }
      options.push(...run);
      continue;
    }

    if (isWhitespaceNode(node)) continue;
    stem.push(node);
  }

  return { stem, options, optionSlot, solution };
}

function toText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function toBlankSpec(props: BlankProps): BlankSpec {
  const answer = toText(props.answer);
  const kind: BlankKind = props.kind === 'math' || props.kind === 'text' ? props.kind : inferBlankKind(answer);
  return {
    answer,
    aliases: (props.aliases ?? []).map(toText).filter((alias) => alias !== ''),
    tolerance:
      typeof props.tolerance === 'number' && Number.isFinite(props.tolerance)
        ? props.tolerance
        : undefined,
    kind,
  };
}

/**
 * Finds every <Blank> in the stem (in document order) and hands each one its
 * position and resolved kind, returning the rewritten stem with the specs.
 */
export function indexBlanks(stem: ReactNode[]) {
  const specs: BlankSpec[] = [];

  const visit = (node: ReactNode): ReactNode => {
    if (Array.isArray(node)) return node.map(visit);
    if (!isValidElement<WithChildren>(node)) return node;

    if (isBlank(node)) {
      const spec = toBlankSpec((node as ReactElement<BlankProps>).props);
      specs.push(spec);
      return cloneElement(node as ReactElement<BlankProps>, { index: specs.length - 1, kind: spec.kind });
    }

    const children = node.props.children;
    if (children === undefined || typeof children === 'string') return node;
    const next = Children.map(children, visit);
    return cloneElement(node, undefined, ...(next ?? []));
  };

  return { stem: stem.map(visit), blanks: specs };
}

type BuildInput = {
  type: QuestionType;
  answer?: boolean;
  options: ReactElement<OptionProps>[];
  blanks: BlankSpec[];
};

/** The gradable spec of a question; null when it is an essay or its key is inconsistent. */
export function buildGradingSpec({ type, answer, options, blanks }: BuildInput): GradingSpec | null {
  if (type === 'boolean') return typeof answer === 'boolean' ? { kind: 'boolean', answer } : null;
  if (type === 'blank') return blanks.length > 0 ? { kind: 'blank', blanks } : null;
  if (type !== 'single' && type !== 'multiple') return null;

  const key = options.flatMap((option, index) => (option.props.correct === true ? [getOptionLetter(index)] : []));
  const valid = options.length >= 2 && (type === 'single' ? key.length === 1 : key.length >= 2);
  return valid ? { kind: 'choice', multiple: type === 'multiple', key } : null;
}

export function toChoiceOptions(options: ReactElement<OptionProps>[]): ChoiceOptionModel[] {
  return options.map((option, index) => ({ label: getOptionLetter(index), content: option.props.children }));
}

/* ---------------------------------------------------------------------------
 * Built-in question tags
 *
 *   tags="2023 统考, 数据结构, 易错"
 *   tags={["来源:2023 统考", "章节:栈与队列"]}
 *
 * Commas (, ， 、) separate tags. "分类:值" shows the category in a lighter
 * weight, and every tag of one category shares a colour.
 * ------------------------------------------------------------------------- */

export const QUESTION_TAG_LIMIT = 8;
export const QUESTION_TAG_MAX_LENGTH = 32;
export const TAG_TONES = 8;

export type QuestionTag = {
  label: string;
  /** Category before a colon, if any. */
  group?: string;
  /** Palette index, stable across pages. */
  tone: number;
};

/** FNV-1a; colours must not change between builds or devices. */
export function tagTone(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % TAG_TONES;
}

export function splitTagList(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(/[,，、]/u)
      : [];
  return list.map((item) => item.trim()).filter((item) => item !== '');
}

export function parseQuestionTags(value: unknown): QuestionTag[] {
  const seen = new Set<string>();
  const tags: QuestionTag[] = [];
  for (const item of splitTagList(value)) {
    const match = /^([^:：]{1,12})[:：]\s*(.+)$/u.exec(item);
    const group = match?.[1].trim();
    const label = (match?.[2] ?? item).trim();
    const key = `${group ?? ''}\u0000${label}`;
    if (!label || seen.has(key)) continue;
    seen.add(key);
    tags.push({ label, ...(group ? { group } : {}), tone: tagTone(group ?? label) });
    if (tags.length === QUESTION_TAG_LIMIT) break;
  }
  return tags;
}
