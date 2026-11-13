'use client';

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  DeleteIcon,
  TriangleAlertIcon,
} from 'lucide-react';
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
import { releaseRoom, reserveRoom, revealField } from './keypad-room';

const DESKTOP = '(min-width: 768px)';

/*
 * On-screen maths keypad, shared by every maths blank (only the focused one
 * shows it). Laid out after the Desmos and GeoGebra keypads: one grid of
 * eight columns, maths helpers on the left, the digit pad in the middle,
 * operators beside it and a fixed column of delete, caret arrows and a tall
 * enter key on the right, so those never move when the layer changes. The
 * f(x) and abc layers are one-shot: picking a key returns to 123.
 *
 * Keys never take focus from the field on pointer input, so the caret stays
 * where the reader put it; long-pressing delete or the arrows repeats.
 */

type Variant = 'digit' | 'op' | 'fn' | 'control' | 'primary';
type Layer = 'main' | 'functions' | 'letters';

type Key = {
  label: ReactNode;
  /** Spoken name; defaults to the label text. */
  name?: string;
  variant?: Variant;
  repeat?: boolean;
  /** Grid placement for the fixed control column. */
  area?: string;
  run: (editor: MathEditor) => void;
};

const LAYERS: { id: Layer; label: ReactNode; name: string }[] = [
  { id: 'main', label: '123', name: '数字与运算' },
  { id: 'functions', label: <span><var>f</var>(<var>x</var>)</span>, name: '函数' },
  { id: 'letters', label: 'abc', name: '字母' },
];

const text = (value: string, name?: string, variant: Variant = 'digit'): Key =>
  ({ label: value, name, variant, run: (editor) => editor.insert(value) });
const op = (value: string, name: string): Key => text(value, name, 'op');
const variable = (name: string): Key =>
  ({ label: <var>{name}</var>, name, variant: 'fn', run: (editor) => editor.insert(name) });
const call = (fn: string, spoken: string, label: ReactNode = fn): Key =>
  ({ label, name: spoken, variant: 'fn', run: (editor) => editor.wrap(`${fn}(`, ')') });
const template = (label: ReactNode, name: string, open: string, close: string): Key =>
  ({ label, name, variant: 'fn', run: (editor) => editor.wrap(open, close) });

const BOX = <span data-key-box="" />;

const FRACTION: Key = {
  label: <span data-key-frac="">{BOX}{BOX}</span>,
  name: '分数线',
  variant: 'fn',
  run: (editor) => editor.fraction(),
};

const MAIN: Key[] = [
  variable('x'), variable('y'), text('π', '圆周率', 'fn'), text('7'), text('8'), text('9'), op('÷', '除'),
  FRACTION, template(<span>√{BOX}</span>, '平方根', '√(', ')'), { ...variable('e'), name: '自然常数 e' }, text('4'), text('5'), text('6'), op('×', '乘'),
  { label: <span><var>x</var><sup>2</sup></span>, name: '平方', variant: 'fn', run: (editor) => editor.insert('²') },
  template(<span><var>x</var><sup>{BOX}</sup></span>, '乘方', '^(', ')'),
  text('=', '等号', 'fn'), text('1'), text('2'), text('3'), op('−', '减'),
  op('(', '左括号'), op(')', '右括号'), template(<span>|{BOX}|</span>, '绝对值', '|', '|'), text('0'), text('.', '小数点'), text('%', '百分号'), op('+', '加'),
];

const FUNCTIONS: Key[] = [
  call('sin', '正弦'), call('cos', '余弦'), call('tan', '正切'), call('ln', '自然对数'), call('lg', '常用对数'),
  { label: <span>log<sub>{BOX}</sub></span>, name: '对数，底数在前', variant: 'fn', run: (editor) => editor.insert('log(,)', 2) },
  template(<span><var>e</var><sup>{BOX}</sup></span>, 'e 的乘方', 'e^(', ')'),
  call('arcsin', '反正弦', <span data-key-long="">arcsin</span>),
  call('arccos', '反余弦', <span data-key-long="">arccos</span>),
  call('arctan', '反正切', <span data-key-long="">arctan</span>),
  template(<span data-key-root=""><small>3</small>√{BOX}</span>, '立方根', '∛(', ')'),
  { label: <span><var>x</var><sup>3</sup></span>, name: '立方', variant: 'fn', run: (editor) => editor.insert('³') },
  template(<span><var>x</var><sup>−1</sup></span>, '倒数', '(', ')^(-1)'),
  text(',', '逗号', 'fn'),
  call('cot', '余切'), call('sec', '正割'), call('csc', '余割'), call('sinh', '双曲正弦'), call('cosh', '双曲余弦'), call('tanh', '双曲正切'),
  text('!', '阶乘', 'fn'),
  template(<span>10<sup>{BOX}</sup></span>, '10 的乘方', '10^(', ')'),
  call('exp', '指数函数'), variable('n'), variable('t'), variable('k'), op('(', '左括号'), op(')', '右括号'),
];

const LETTERS: Key[] = [
  ...'abcdfghijklmnopqrstuvwxyz'.split('').map(variable),
  text('=', '等号', 'fn'), text(',', '逗号', 'fn'), op('+', '加'),
];

const LAYER_KEYS: Record<Layer, Key[]> = { main: MAIN, functions: FUNCTIONS, letters: LETTERS };

const DELETE: Key = { label: <DeleteIcon />, name: '删除', variant: 'control', repeat: true, area: 'delete', run: (editor) => editor.backspace() };
const LEFT: Key = { label: <ChevronLeftIcon />, name: '光标左移', variant: 'control', repeat: true, run: (editor) => editor.move(-1) };
const RIGHT: Key = { label: <ChevronRightIcon />, name: '光标右移', variant: 'control', repeat: true, run: (editor) => editor.move(1) };

/** A press that never steals focus from the field; Enter / Space on a focused key still works. */
function usePress(run: () => void, repeat = false) {
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});
  const [pressed, setPressed] = useState(false);
  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
    timers.current = {};
    setPressed(false);
  };
  useEffect(() => stop, []);

  return {
    'data-pressed': pressed ? '' : undefined,
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0) return;
      // Keep focus (and the caret) in the field.
      event.preventDefault();
      setPressed(true);
      run();
      if (repeat) {
        timers.current.delay = setTimeout(() => {
          timers.current.repeat = setInterval(run, 70);
        }, 420);
      }
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Keyboard activation arrives as a click without a pointer.
    onClick(event: { detail: number }) { if (event.detail === 0) run(); },
    onContextMenu(event: { preventDefault(): void }) { event.preventDefault(); },
  };
}

function KeyButton({ entry, editor, after }: { entry: Key; editor: RefObject<MathEditor>; after?: () => void }) {
  // The ref sees the editor of the latest value, so repeats never act on a stale one.
  const press = usePress(() => { entry.run(editor.current); after?.(); }, entry.repeat);
  return (
    <button
      type="button"
      data-key=""
      data-variant={entry.variant ?? 'digit'}
      aria-label={entry.name}
      style={entry.area ? { gridArea: entry.area } : undefined}
      {...press}
    >
      {entry.label}
    </button>
  );
}

function ToolButton({ label, run, children, ...rest }: { label: string; run: () => void; children: ReactNode; disabled?: boolean; 'aria-pressed'?: boolean }) {
  const press = usePress(run);
  return (
    <button type="button" data-keypad-tool="" aria-label={label} {...rest} {...press}>
      {children}
    </button>
  );
}

export function MathKeypad({
  editor,
  value,
  label,
  index,
  count,
  last,
  instant,
  input,
  onDismiss,
}: {
  editor: MathEditor;
  value: string;
  label: string;
  index: number;
  count: number;
  last: boolean;
  instant: boolean;
  input: RefObject<HTMLInputElement | null>;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(editor);
  latest.current = editor;
  const [layer, setLayer] = useState<Layer>('main');
  const parsed = value.trim() ? parseMath(value) : null;
  const error = parsed && !parsed.ok ? parsed.error : null;
  const back = layer === 'main' ? undefined : () => setLayer('main');

  // Reserve room below the content for the keypad and keep the field clear of it.
  useLayoutEffect(() => {
    const element = root.current;
    const field = input.current;
    if (!element || !field) return;
    // Desktop: centred over the question rather than the window, clear of the sidebar.
    const place = () => {
      if (!window.matchMedia(DESKTOP).matches) {
        element.style.removeProperty('--keypad-x');
        return;
      }
      const card = (field.closest('[data-exam-question]') ?? field).getBoundingClientRect();
      const half = element.offsetWidth / 2;
      const x = Math.min(window.innerWidth - half - 12, Math.max(half + 12, card.left + card.width / 2));
      element.style.setProperty('--keypad-x', `${Math.round(x)}px`);
    };
    // Measured from the layout, not the box, which is still sliding in.
    const top = () => window.innerHeight - element.offsetHeight - (parseFloat(getComputedStyle(element).bottom) || 0);
    place();
    reserveRoom(field, window.innerHeight - top());
    revealField(field, top(), !instant);
    let height = element.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (element.offsetHeight === height) return;
      height = element.offsetHeight;
      reserveRoom(field, window.innerHeight - top());
    });
    observer.observe(element);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      releaseRoom();
    };
  }, [input, instant]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && (root.current?.contains(next) || next === input.current)) return;
    onDismiss();
  };

  const enter: Key = {
    label: last
      ? <><CheckIcon /><span>提交</span></>
      : <><ChevronRightIcon /><span>下一空</span></>,
    name: last ? '提交答案' : '下一空',
    variant: 'primary',
    area: 'enter',
    run: (current) => current.enter(),
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
      <div data-keypad-display="" data-invalid={error ? '' : undefined}>
        <span data-keypad-label="">{count > 1 ? label : '答案'}</span>
        <MathPreview text={value} fallback={<span data-keypad-placeholder="">输入数字或表达式</span>} />
        {error ? (
          <span data-math-error="" role="status">
            <TriangleAlertIcon aria-hidden="true" />
            {error}
          </span>
        ) : null}
      </div>

      <div data-keypad-toolbar="">
        <div data-keypad-layers="" role="group" aria-label="键盘布局">
          {LAYERS.map((entry) => (
            <ToolButton key={entry.id} label={entry.name} aria-pressed={layer === entry.id} run={() => setLayer(entry.id)}>
              {entry.label}
            </ToolButton>
          ))}
        </div>
        <div data-keypad-actions="">
          <ToolButton label="清空" disabled={!value} run={() => latest.current.clear()}>清空</ToolButton>
          {count > 1 ? (
            <div data-keypad-stepper="">
              <ToolButton label="上一空" disabled={index === 0} run={() => latest.current.step(-1)}><ChevronLeftIcon /></ToolButton>
              <span aria-hidden="true">{index + 1}<i>/</i>{count}</span>
              <ToolButton label="下一空" disabled={last} run={() => latest.current.step(1)}><ChevronRightIcon /></ToolButton>
            </div>
          ) : null}
          <ToolButton label="收起数学键盘" run={() => latest.current.close()}><ChevronDownIcon /></ToolButton>
        </div>
      </div>

      <div data-keypad-grid="" data-layer={layer}>
        {LAYER_KEYS[layer].map((entry, position) => (
          <KeyButton key={`${layer}-${position}`} entry={entry} editor={latest} after={back} />
        ))}
        <KeyButton entry={DELETE} editor={latest} />
        <div data-key-pair="" style={{ gridArea: 'arrows' }}>
          <KeyButton entry={LEFT} editor={latest} />
          <KeyButton entry={RIGHT} editor={latest} />
        </div>
        <KeyButton entry={enter} editor={latest} />
      </div>
    </div>
  );
}
