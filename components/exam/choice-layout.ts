import { isValidElement, type ReactNode } from 'react';

/*
 * Choice auto-layout.
 *
 * Server: getChoiceDensity() picks a conservative container-query fallback from
 * the option text, so pages read well before (or without) JavaScript.
 * Client: getChoiceColumnCount() picks the densest 4 / 2 / 1 column grid in
 * which the widest *rendered* option fits without wrapping.
 */

export type ChoiceDensity = 'compact' | 'regular' | 'long';
export type ChoiceColumnCount = 1 | 2 | 4;

const FIT_EPSILON_PX = 1;

function getNodeTextLength(node: ReactNode): number {
  if (node === null || node === undefined || typeof node === 'boolean') return 0;
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).trim().length;
  }
  if (Array.isArray(node)) {
    return node.reduce((length, child) => length + getNodeTextLength(child), 0);
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeTextLength(node.props.children);
  }
  return 1;
}

const COMPLEX_MATH_CLASS =
  /(?:^|\s)(?:mfrac|mroot|msup|msub|msubsup|mover|munder|mtable|katex-display)(?:\s|$)/u;

function hasComplexMath(node: ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasComplexMath);
  if (!isValidElement<{ children?: ReactNode; className?: unknown }>(node)) {
    return false;
  }

  const className =
    typeof node.props.className === 'string' ? node.props.className : '';
  return COMPLEX_MATH_CLASS.test(className) || hasComplexMath(node.props.children);
}

/** Server-rendered fallback until the client has measured real widths. */
export function getChoiceDensity(options: ReactNode[]): ChoiceDensity {
  const longestOption = options.reduce<number>(
    (longest, option) => Math.max(longest, getNodeTextLength(option)),
    0,
  );

  if (options.some(hasComplexMath)) return 'regular';
  if (longestOption <= 10) return 'compact';
  if (longestOption >= 25) return 'long';
  return 'regular';
}

function getCandidateColumns(optionCount: number): ChoiceColumnCount[] {
  if (optionCount >= 4) return [4, 2, 1];
  if (optionCount >= 2) return [2, 1];
  return [1];
}

type ChoiceColumnInput = {
  containerWidth: number;
  optionWidths: readonly number[];
  columnGap: number;
};

export function getChoiceColumnCount({
  containerWidth,
  optionWidths,
  columnGap,
}: ChoiceColumnInput): ChoiceColumnCount {
  if (
    !Number.isFinite(containerWidth) ||
    containerWidth <= 0 ||
    optionWidths.length === 0 ||
    optionWidths.some((width) => !Number.isFinite(width) || width < 0)
  ) {
    return 1;
  }

  const safeGap = Number.isFinite(columnGap) && columnGap > 0 ? columnGap : 0;
  const widestOption = Math.max(...optionWidths);

  for (const columns of getCandidateColumns(optionWidths.length)) {
    if (columns === 1) return 1;

    const availableWidth = containerWidth - safeGap * (columns - 1);
    if (availableWidth <= 0) continue;

    if (widestOption <= availableWidth / columns + FIT_EPSILON_PX) {
      return columns;
    }
  }

  return 1;
}
