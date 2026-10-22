'use client';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, DeleteIcon, CornerDownLeftIcon } from 'lucide-react';
import {
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { parseMath } from '@/lib/math-expression';
import type { MathEditor } from './math-blank';
import { MathPreview } from './math-preview';

/*
 * On-screen maths keypad, shared by every maths blank (only the focused one
 * shows it). Keys never take focus from the field on pointer input, so the
 * caret stays where the reader put it; long-pressing delete or the arrows
 * repeats.
 */

type Variant = 'digit' | 'op' | 'fn' | 'control' | 'primary';

type Key = {
  label: ReactNode;
  /** Spoken name; defaults to the label text. */
  name?: string;
  variant?: Variant;
  repeat?: boolean;
  run: (editor: MathEditor) => void;
};

const text = (value: string, name?: string, variant: Variant = 'digit'): Key =>
  ({ label: value, name, variant, run: (editor) => editor.insert(value) });
const fn = (name: string, spoken: string, label: ReactNode = name): Key =>
  ({ label, name: spoken, variant: 'fn', run: (editor) => editor.insert(`${name}()`, 1) });
const variable = (name: string): Key =>
  ({ label: <var>{name}</var>, name, variant: 'fn', run: (editor) => editor.insert(name) });

const LEFT: Key = { label: <ChevronLeftIcon />, name: '光标左移', variant: 'control', repeat: true, run: (editor) => editor.move(-1) };
const RIGHT: Key = { label: <ChevronRightIcon />, name: '光标右移', variant: 'control', repeat: true, run: (editor) => editor.move(1) };
const DELETE: Key = { label: <DeleteIcon />, name: '删除', variant: 'control', repeat: true, run: (editor) => editor.backspace() };

function bottomRows(last: boolean): Key[] {
  return [
    text('1'), text('2'), text('3'), text('−', '减', 'op'), LEFT, RIGHT,
    text('0'), text('.', '小数点'), text('%', '百分号', 'op'), text('+', '加', 'op'), DELETE,
    { label: last ? '提交' : <><span className="sr-only">下一空</span><CornerDownLeftIcon /></>, name: last ? '提交答案' : '下一空', variant: 'primary', run: (editor) => editor.enter() },
  ];
}

function mainRows(toggle: () => void): Key[] {
  return [
    { label: 'f(x)', name: '函数键盘', variant: 'control', run: toggle },
    variable('x'), variable('y'), text('π', '圆周率', 'fn'),
    { label: '√', name: '平方根', variant: 'fn', run: (editor) => editor.insert('√()', 1) },
    { label: <span><var>x</var><sup>□</sup></span>, name: '乘方', variant: 'fn', run: (editor) => editor.insert('^()', 1) },
    text('7'), text('8'), text('9'), text('÷', '除', 'op'), text('(', '左括号', 'op'), text(')', '右括号', 'op'),
    text('4'), text('5'), text('6'), text('×', '乘', 'op'),
    { label: <span><var>x</var><sup>2</sup></span>, name: '平方', variant: 'fn', run: (editor) => editor.insert('²') },
    { label: <span className="flex flex-col items-center text-[0.75em] leading-[1.05]"><span className="border-b border-current px-0.5">□</span><span>□</span></span>, name: '分数线', variant: 'fn', run: (editor) => editor.insert('/') },
  ];
}

function functionRows(toggle: () => void): Key[] {
  return [
    { label: '123', name: '数字键盘', variant: 'control', run: toggle },
    fn('sin', '正弦'), fn('cos', '余弦'), fn('tan', '正切'), fn('ln', '自然对数'), fn('lg', '常用对数'),
    fn('arcsin', '反正弦'), fn('arccos', '反余弦'), fn('arctan', '反正切'),
    { label: <span>log<sub className="text-[0.7em]">□</sub></span>, name: '对数，底数在前', variant: 'fn', run: (editor) => editor.insert('log(,)', 2) },
    { label: <span><var>e</var><sup>□</sup></span>, name: 'e 的乘方', variant: 'fn', run: (editor) => editor.insert('e^()', 1) },
    { label: '|□|', name: '绝对值', variant: 'fn', run: (editor) => editor.insert('||', 1) },
    variable('n'), variable('t'), variable('a'),
    text('!', '阶乘', 'fn'), text(',', '逗号', 'fn'),
    { label: '∛', name: '立方根', variant: 'fn', run: (editor) => editor.insert('∛()', 1) },
  ];
}

function KeyButton({ entry, editor }: { entry: Key; editor: RefObject<MathEditor> }) {
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});
  const [pressed, setPressed] = useState(false);
  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
    timers.current = {};
    setPressed(false);
  };
  useEffect(() => stop, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    // Keep focus (and the caret) in the field.
    event.preventDefault();
    setPressed(true);
    entry.run(editor.current);
    if (entry.repeat) {
      timers.current.delay = setTimeout(() => {
        // The ref sees the editor of the latest value, so repeats never act on a stale one.
        timers.current.repeat = setInterval(() => entry.run(editor.current), 70);
      }, 420);
    }
  };

  return (
    <button
      type="button"
      data-key=""
      data-variant={entry.variant ?? 'digit'}
      data-pressed={pressed ? '' : undefined}
      aria-label={entry.name}
      onPointerDown={onPointerDown}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // Keyboard activation (Enter / Space on a focused key) arrives as a click without a pointer.
      onClick={(event) => { if (event.detail === 0) entry.run(editor.current); }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entry.label}
    </button>
  );
}

/** The element that scrolls the page: the docs panel on desktop, the document on phones. */
function scrollerOf(element: HTMLElement): Element {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

export function MathKeypad({
  editor,
  value,
  label,
  last,
  instant,
  input,
  onDismiss,
}: {
  editor: MathEditor;
  value: string;
  label: string;
  last: boolean;
  instant: boolean;
  input: RefObject<HTMLInputElement | null>;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(editor);
  latest.current = editor;
  const [layer, setLayer] = useState<'main' | 'functions'>('main');
  const toggle = () => setLayer((current) => (current === 'main' ? 'functions' : 'main'));
  const keys = [...(layer === 'main' ? mainRows(toggle) : functionRows(toggle)), ...bottomRows(last)];
  const parsed = value.trim() ? parseMath(value) : null;

  // Reserve room below the page for the keypad and keep the field above it.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const html = document.documentElement;
    const apply = () => {
      const height = element.getBoundingClientRect().height;
      html.style.setProperty('--exam-keypad-height', `${Math.ceil(height)}px`);
      const field = input.current;
      const rect = field?.getBoundingClientRect();
      const limit = window.innerHeight - height - 16;
      if (field && rect && rect.bottom > limit) {
        scrollerOf(field).scrollBy({ top: rect.bottom - limit, behavior: instant ? 'auto' : 'smooth' });
      }
    };
    html.dataset.keypadOpen = '';
    apply();
    const observer = new ResizeObserver(() => html.style.setProperty('--exam-keypad-height', `${Math.ceil(element.getBoundingClientRect().height)}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      delete html.dataset.keypadOpen;
      html.style.removeProperty('--exam-keypad-height');
    };
  }, [input, instant]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && (root.current?.contains(next) || next === input.current)) return;
    onDismiss();
  };

  return (
    <div
      ref={root}
      role="group"
      aria-label={`数学键盘 · ${label}`}
      data-math-keypad=""
      style={instant ? { animation: 'none' } : undefined}
      onBlur={onBlur}
      onKeyDown={(event) => { if (event.key === 'Escape') editor.close(); }}
    >
      <div data-keypad-preview="">
        <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
        <MathPreview
          text={value}
          fallback={<span className="font-sans text-sm text-muted-foreground">输入数字或表达式</span>}
        />
        {parsed && !parsed.ok ? <span data-math-error="" role="status">{parsed.error}</span> : null}
        <button
          type="button"
          data-key=""
          data-variant="control"
          aria-label="收起数学键盘"
          className="h-9! w-10 shrink-0"
          onPointerDown={(event) => { event.preventDefault(); editor.close(); }}
          onClick={(event) => { if (event.detail === 0) editor.close(); }}
        >
          <ChevronDownIcon />
        </button>
      </div>
      <div data-keypad-grid="">
        {keys.map((entry, position) => <KeyButton key={`${layer}-${position}`} entry={entry} editor={latest} />)}
      </div>
    </div>
  );
}
