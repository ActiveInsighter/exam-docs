import type { ReactNode } from 'react';
import { BlankField } from './blank-field';

/*
 * The four authoring components. <Option> and <Solution> are pure markers that
 * <Question> reads from its children; <Blank> is the one that renders (an
 * input) because it lives inside the stem text.
 */

export type OptionProps = {
  /** Marks a correct option. One for `single`, two or more for `multiple`. */
  correct?: boolean;
  children?: ReactNode;
};

export type BlankProps = {
  answer: string | number;
  /** Other accepted spellings of the answer. */
  aliases?: readonly (string | number)[];
  /** Accepts numeric input within ±tolerance of the answer or an alias. */
  tolerance?: number;
  /**
   * text: the system keyboard, compared as normalised text.
   * math: the maths keypad, compared as equivalent expressions.
   * Default: math for purely numeric answers ("3", "-1/2", "2√3"), else text.
   */
  kind?: 'text' | 'math';
  /** Hint shown in the empty field. */
  placeholder?: string;
  /** Position of the blank in its question; assigned by <Question>. */
  index?: number;
};

export type SolutionProps = {
  children?: ReactNode;
};

/** One answer option of a `single` / `multiple` question. Letters are automatic. */
export function Option({ children }: OptionProps) {
  return <>{children}</>;
}

/**
 * Reference answer, steps and explanation. Ordinary MDX (maths, lists, tables,
 * code); shown in the answer dialog and never on the page itself.
 */
export function Solution({ children }: SolutionProps) {
  return <>{children}</>;
}

/** A blank inside the stem of a `blank` question. */
export function Blank({ answer, index, kind, placeholder }: BlankProps) {
  return <BlankField answer={String(answer)} index={index ?? 0} kind={kind === 'math' ? 'math' : 'text'} placeholder={placeholder} />;
}
