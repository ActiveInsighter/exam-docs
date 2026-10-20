import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Blank, Option, Solution, type BlankProps, type OptionProps } from './parts';
import {
  getOptionLetter,
  type BlankSpec,
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
  /** Text shown in the marker when it differs from the label. */
  marker?: string;
  content: ReactNode;
  correct: boolean;
};

export type QuestionModel =
  | {
      kind: 'choice';
      multiple: boolean;
      options: ChoiceOptionModel[];
      key: string[];
      /** Answer text for display when it is not just the letters. */
      keyText?: string;
    }
  | { kind: 'blank'; blanks: BlankSpec[] }
  | { kind: 'none' };

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

export const OPTION_SLOT = Symbol('question-option-slot');

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
  return {
    answer: toText(props.answer),
    aliases: (props.aliases ?? []).map(toText).filter((alias) => alias !== ''),
    tolerance:
      typeof props.tolerance === 'number' && Number.isFinite(props.tolerance)
        ? props.tolerance
        : undefined,
  };
}

/**
 * Finds every <Blank> in the stem (in document order) and hands each one its
 * position, returning the rewritten stem together with the answer specs.
 */
export function indexBlanks(stem: ReactNode[]) {
  const specs: BlankSpec[] = [];

  const visit = (node: ReactNode): ReactNode => {
    if (Array.isArray(node)) return node.map(visit);
    if (!isValidElement<WithChildren>(node)) return node;

    if (isBlank(node)) {
      const props = (node as ReactElement<BlankProps>).props;
      specs.push(toBlankSpec(props));
      return cloneElement(node as ReactElement<BlankProps>, { index: specs.length - 1 });
    }

    const children = node.props.children;
    if (children === undefined || typeof children === 'string') return node;
    const next = Children.map(children, visit);
    return cloneElement(node, undefined, ...(next ?? []));
  };

  return { stem: stem.map(visit), blanks: specs };
}

export const BOOLEAN_OPTIONS: ChoiceOptionModel[] = [
  { label: 'A', marker: '对', content: '正确', correct: false },
  { label: 'B', marker: '错', content: '错误', correct: false },
];

type BuildInput = {
  type: QuestionType;
  answer?: boolean;
  options: ReactElement<OptionProps>[];
};

/** Builds the gradable model; anything inconsistent degrades to "none". */
export function buildChoiceModel({ type, answer, options }: BuildInput): QuestionModel {
  if (type === 'boolean') {
    if (typeof answer !== 'boolean') return { kind: 'none' };
    const items = BOOLEAN_OPTIONS.map((option, index) => ({
      ...option,
      correct: answer === (index === 0),
    }));
    return {
      kind: 'choice',
      multiple: false,
      options: items,
      key: [answer ? 'A' : 'B'],
      keyText: answer ? '正确' : '错误',
    };
  }

  if (type !== 'single' && type !== 'multiple') return { kind: 'none' };

  const items = options.map((option, index) => ({
    label: getOptionLetter(index),
    content: option.props.children,
    correct: option.props.correct === true,
  }));
  const key = items.filter((item) => item.correct).map((item) => item.label);
  const valid =
    items.length >= 2 && (type === 'single' ? key.length === 1 : key.length >= 2);
  return valid
    ? { kind: 'choice', multiple: type === 'multiple', options: items, key }
    : { kind: 'none' };
}
