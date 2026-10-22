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
import { advanceFrom } from './blank-navigation';
import type { QuestionState } from './question-state';

const MathKeypad = lazy(() => import('./math-keypad').then((module) => ({ default: module.MathKeypad })));

/** Commands the keypad sends to the field it is attached to. */
export type MathEditor = {
  /** Replaces the selection with `text`; the caret ends `caretBack` characters before its end. */
  insert(text: string, caretBack?: number): void;
  backspace(): void;
  move(delta: number): void;
  clear(): void;
  enter(): void;
  close(): void;
};

/** Function openers removed as one unit by backspace: "sin(" not "(". */
const TOKEN_BEFORE_CARET = /(?:arcsin|arccos|arctan|sinh|cosh|tanh|sqrt|cbrt|sin|cos|tan|cot|sec|csc|abs|exp|log|ln|lg|√|∛)\($/u;

export function deleteBackward(value: string, start: number, end: number): { value: string; caret: number } {
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
  if (start === 0) return { value, caret: 0 };
  const before = value.slice(0, start);
  const token = TOKEN_BEFORE_CARET.exec(before)?.[0];
  const from = start - (token?.length ?? 1);
  // An empty pair "(|)" goes away together.
  const removedOpen = (token ?? before.at(-1) ?? '').endsWith('(');
  const to = removedOpen && value[start] === ')' ? start + 1 : start;
  return { value: value.slice(0, from) + value.slice(to), caret: from };
}

type MathBlankProps = {
  value: string;
  disabled: boolean;
  placeholder?: string;
  style: CSSProperties;
  question: QuestionState;
  index: number;
  label: string;
  last: boolean;
  'aria-label': string;
  'aria-invalid'?: boolean;
  'data-feedback': string;
  'data-fresh'?: string;
};

/** When focus moves straight from one maths blank to the next, the keypad does not slide in again. */
let lastClosedAt = 0;

/**
 * A maths blank. `inputMode="none"` keeps the system keyboard away on phones
 * and tablets while the caret, selection and a hardware keyboard keep working;
 * the on-screen keypad (loaded on first focus) edits the same value.
 */
export function MathBlank({ value, question, index, label, last, ...field }: MathBlankProps) {
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
    const selection = () => {
      const element = input.current;
      const start = element?.selectionStart ?? value.length;
      return { start, end: element?.selectionEnd ?? start };
    };
    return {
      insert(text, caretBack = 0) {
        const { start, end } = selection();
        write(value.slice(0, start) + text + value.slice(end), start + text.length - caretBack);
      },
      backspace() {
        const { start, end } = selection();
        const next = deleteBackward(value, start, end);
        write(next.value, next.caret);
      },
      move(delta) {
        const element = input.current;
        if (!element) return;
        const { start, end } = selection();
        const base = start === end ? start : delta < 0 ? start : end;
        const position = Math.min(value.length, Math.max(0, base + (start === end ? delta : 0)));
        element.setSelectionRange(position, position);
      },
      clear() { write('', 0); },
      enter() {
        if (input.current) advanceFrom(input.current, question);
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
