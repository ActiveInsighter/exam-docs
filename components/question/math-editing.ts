/*
 * Pure text edits behind the maths keypad. Each takes the field's value and
 * selection and returns the new value with the caret position, so the
 * component only applies results and the rules are unit-tested
 * (tests/math-editing.test.ts).
 */

export type Selection = { start: number; end: number };
export type EditResult = { value: string; caret: number };

/** Function openers removed as one unit by backspace: "sin(" not "(". */
const TOKEN_BEFORE_CARET = /(?:arcsin|arccos|arctan|sinh|cosh|tanh|sqrt|cbrt|sin|cos|tan|cot|sec|csc|abs|exp|log|ln|lg|√|∛|\^)\($/u;

const clamp = (value: string, position: number) => Math.min(value.length, Math.max(0, position));

/** Replaces the selection with `text`; the caret ends `caretBack` characters before its end. */
export function insertText(value: string, { start, end }: Selection, text: string, caretBack = 0): EditResult {
  // Typing a closing bracket in front of the one a template left steps over it.
  if (text === ')' && start === end && value[start] === ')') return { value, caret: start + 1 };
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length - caretBack };
}

/** Puts the selection between `open` and `close` (caret after), or an empty pair with the caret inside. */
export function wrapSelection(value: string, { start, end }: Selection, open: string, close: string): EditResult {
  const inner = value.slice(start, end);
  return {
    value: value.slice(0, start) + open + inner + close + value.slice(end),
    caret: start + open.length + inner.length + (inner ? close.length : 0),
  };
}

/** A fraction bar: a selection becomes the bracketed numerator, otherwise "/" is typed. */
export function insertFraction(value: string, selection: Selection): EditResult {
  if (selection.start !== selection.end) return wrapSelection(value, selection, '(', ')/');
  return insertText(value, selection, '/');
}

export function deleteBackward(value: string, start: number, end: number): EditResult {
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
  if (start === 0) return { value, caret: 0 };
  const before = value.slice(0, start);
  const token = TOKEN_BEFORE_CARET.exec(before)?.[0];
  const from = start - (token?.length ?? 1);
  // An empty pair "(|)" or "|x|"-less "||" goes away together.
  const removed = token ?? before.at(-1) ?? '';
  const pairs = (removed.endsWith('(') && value[start] === ')') || (removed === '|' && value[start] === '|');
  const to = pairs ? start + 1 : start;
  return { value: value.slice(0, from) + value.slice(to), caret: from };
}

/** Moves the caret; a selection collapses to the side moved towards. */
export function moveCaret(value: string, { start, end }: Selection, delta: number): number {
  if (start !== end) return delta < 0 ? start : end;
  return clamp(value, start + delta);
}
