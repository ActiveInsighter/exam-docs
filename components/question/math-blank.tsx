'use client';

import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  lazy,
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { MATH_INPUT_MAX_LENGTH } from '@/lib/math-expression';
import { advanceFrom, stepFrom } from './blank-navigation';
import { deleteBackward, type EditResult, insertFraction, insertText, moveCaret, type Selection, wrapSelection } from './math-editing';
import type { QuestionState } from './question-state';

const MathKeypad = lazy(() => import('./math-keypad').then((module) => ({ default: module.MathKeypad })));

/** Commands the keypad sends to the field it is attached to. */
export type MathEditor = {
  /** Replaces the selection with `text`; the caret ends `caretBack` characters before its end. */
  insert(text: string, caretBack?: number): void;
  /** Puts the selection between `open` and `close` (caret after), or an empty pair with the caret inside. */
  wrap(open: string, close: string): void;
  /** A fraction bar; a selection becomes the numerator. */
  fraction(): void;
  backspace(): void;
  move(delta: number): void;
  clear(): void;
  enter(): void;
  /** Focuses the previous (-1) or next (1) blank of the question. */
  step(delta: -1 | 1): void;
  close(): void;
};

export { deleteBackward } from './math-editing';

type MathBlankProps = {
  value: string;
  disabled: boolean;
  placeholder?: string;
  style: CSSProperties;
  question: QuestionState;
  index: number;
  count: number;
  label: string;
  last: boolean;
  'aria-label': string;
  'aria-invalid'?: boolean;
  'data-feedback': string;
  'data-fresh'?: string;
  'data-manual'?: string;
};

/** When focus moves straight from one maths blank to the next, the keypad does not slide in again. */
let lastClosedAt = 0;

/**
 * A maths blank. `inputMode="none"` keeps the system keyboard away on phones
 * and tablets while the caret, selection and a hardware keyboard keep working;
 * the on-screen keypad (loaded on first focus) edits the same value.
 */
export function MathBlank({ value, question, index, count, label, last, ...field }: MathBlankProps) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);

  // Put the caret where the last command left it, once React has written the value.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element || caret.current === null) return;
    element.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);

  const write = useCallback((next: string, position: number) => {
    if (next.length > MATH_INPUT_MAX_LENGTH) return;
    caret.current = position;
    if (next === value && input.current) input.current.setSelectionRange(position, position);
    question.setValue(index, next);
  }, [question, index, value]);

  const editor = useMemo<MathEditor>(() => {
    const selection = (): Selection => {
      const element = input.current;
      const start = element?.selectionStart ?? value.length;
      return { start, end: element?.selectionEnd ?? start };
    };
    const apply = (result: EditResult) => write(result.value, result.caret);
    return {
      insert(text, caretBack = 0) { apply(insertText(value, selection(), text, caretBack)); },
      wrap(open, close) { apply(wrapSelection(value, selection(), open, close)); },
      fraction() { apply(insertFraction(value, selection())); },
      backspace() {
        const { start, end } = selection();
        apply(deleteBackward(value, start, end));
      },
      move(delta) {
        const position = moveCaret(value, selection(), delta);
        input.current?.setSelectionRange(position, position);
      },
      clear() { write('', 0); },
      enter() {
        if (input.current) advanceFrom(input.current, question);
      },
      step(delta) {
        if (input.current) stepFrom(input.current, delta);
      },
      close() { input.current?.blur(); setOpen(false); },
    };
  }, [value, write, question]);

  const onFocus = () => {
    setInstant(Date.now() - lastClosedAt < 200);
    setOpen(true);
  };
  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget as HTMLElement | null;
    if (next?.closest('[data-math-keypad]')) return;
    lastClosedAt = Date.now();
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.close();
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      editor.enter();
    } else if (event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      editor.backspace();
    }
  };

  return (
    <>
      <input
        {...field}
        ref={input}
        value={value}
        type="text"
        inputMode="none"
        enterKeyHint={last ? 'done' : 'next'}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={MATH_INPUT_MAX_LENGTH}
        aria-description="数学表达式，可用屏幕数学键盘输入"
        data-question-blank=""
        data-kind="math"
        data-active={open ? '' : undefined}
        onChange={(event) => question.setValue(index, event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {open && !field.disabled && typeof document !== 'undefined'
        ? createPortal(
          <Suspense fallback={null}>
            <MathKeypad
              editor={editor}
              value={value}
              label={label}
              index={index}
              count={count}
              last={last}
              instant={instant}
              input={input}
              onDismiss={() => { lastClosedAt = Date.now(); setOpen(false); }}
            />
          </Suspense>,
          document.body,
        )
        : null}
    </>
  );
}
