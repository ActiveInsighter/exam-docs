'use client';

import { HighlighterIcon, EraserIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './reading.module.css';

/*
 * The reader's own highlights in the passage, like the highlighter of a
 * computer-based exam: select words, press 高亮; select (or tap) a
 * highlight, press 清除.
 *
 * Painted with the CSS Custom Highlight API (::highlight(exam-reading-mark),
 * HIGHLIGHT_STYLE below), so React's DOM is never touched. Each highlight is
 * stored as character offsets inside one paragraph's English text, which
 * survives re-renders, the translation toggle and font changes. Browsers
 * without the API simply get no highlighter.
 */

export const PASSAGE_PARAGRAPHS = ':scope > p, :scope > [data-reading-paragraph]';

type Mark = { p: number; s: number; e: number };
type Toolbar = { x: number; y: number; marks: Mark[]; selection: Mark[]; range?: Range };

const HIGHLIGHT = 'exam-reading-mark';
const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

/*
 * The ::highlight() rule is added at run time: the build's CSS parser does
 * not know the pseudo-element yet and would drop it from a stylesheet.
 */
const HIGHLIGHT_STYLE = `
::highlight(${HIGHLIGHT}) { background-color: oklch(0.93 0.13 98 / 0.78); color: inherit; }
.dark ::highlight(${HIGHLIGHT}) { background-color: oklch(0.62 0.12 95 / 0.45); color: inherit; }
`;

function installStyle() {
  if (document.getElementById('exam-reading-mark-style')) return;
  const style = document.createElement('style');
  style.id = 'exam-reading-mark-style';
  style.textContent = HIGHLIGHT_STYLE;
  document.head.append(style);
}

/* Every reading card on the page shares the one named highlight. */
const registry = new Map<string, Range[]>();
function paint() {
  if (!supported()) return;
  const ranges = [...registry.values()].flat();
  if (ranges.length) CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
  else CSS.highlights.delete(HIGHLIGHT);
}

/** The English text of each paragraph: a bare <p>, or the original half of a <Paragraph>. */
function paragraphRoots(passage: Element): HTMLElement[] {
  return Array.from(passage.querySelectorAll<HTMLElement>(PASSAGE_PARAGRAPHS), (paragraph) =>
    paragraph.matches('[data-reading-paragraph]')
      ? paragraph.querySelector<HTMLElement>('[data-reading-original]') ?? paragraph
      : paragraph);
}

function textBefore(root: Node, container: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return range.toString().length;
}

/** The point `offset` characters into `root`'s text. */
function locate(root: Node, offset: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let rest = offset;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (rest <= node.length) return [node, rest];
    rest -= node.length;
    last = node;
  }
  return last ? [last, last.length] : [root, 0];
}

function toRange(roots: HTMLElement[], mark: Mark) {
  const root = roots[mark.p];
  if (!root) return null;
  const range = document.createRange();
  range.setStart(...locate(root, mark.s));
  range.setEnd(...locate(root, mark.e));
  return range.collapsed ? null : range;
}

/** A selection as one mark per paragraph it touches. */
function toMarks(roots: HTMLElement[], range: Range): Mark[] {
  const marks: Mark[] = [];
  roots.forEach((root, p) => {
    if (!range.intersectsNode(root)) return;
    const length = root.textContent?.length ?? 0;
    const s = root.contains(range.startContainer) ? textBefore(root, range.startContainer, range.startOffset) : 0;
    const e = root.contains(range.endContainer) ? textBefore(root, range.endContainer, range.endOffset) : length;
    // Trim surrounding spaces so marks start and end on words.
    const text = root.textContent ?? '';
    let start = s;
    let end = e;
    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /\s/.test(text[end - 1])) end -= 1;
    if (end > start) marks.push({ p, s: start, e: end });
  });
  return marks;
}

const overlaps = (a: Mark, b: Mark) => a.p === b.p && a.s < b.e && b.s < a.e;

/** Adds marks, merging any that overlap or touch. */
function merge(marks: Mark[], added: Mark[]) {
  const all = [...marks, ...added].sort((a, b) => a.p - b.p || a.s - b.s);
  const merged: Mark[] = [];
  for (const mark of all) {
    const last = merged[merged.length - 1];
    if (last && last.p === mark.p && mark.s <= last.e) last.e = Math.max(last.e, mark.e);
    else merged.push({ ...mark });
  }
  return merged;
}

function read(key: string): Mark[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((mark) => [mark?.p, mark?.s, mark?.e].every(Number.isInteger)) : [];
  } catch {
    return [];
  }
}

function write(key: string, marks: Mark[]) {
  try {
    if (marks.length) localStorage.setItem(key, JSON.stringify(marks));
    else localStorage.removeItem(key);
  } catch {
    // Private mode: highlights last for this visit only.
  }
}

/** A point inside the passage under a tap, as a collapsed mark. */
function markAtPoint(roots: HTMLElement[], x: number, y: number): Mark | null {
  const position = document.caretPositionFromPoint?.(x, y);
  const node = position?.offsetNode ?? document.caretRangeFromPoint?.(x, y)?.startContainer;
  const offset = position?.offset ?? document.caretRangeFromPoint?.(x, y)?.startOffset ?? 0;
  if (!node) return null;
  const p = roots.findIndex((root) => root.contains(node));
  if (p < 0) return null;
  const at = textBefore(roots[p], node, offset);
  return { p, s: at, e: at + 1 };
}

/** `scroller` is the element holding the passage; marks follow it when it is remounted elsewhere (the expanded card). */
export function useHighlights(scroller: HTMLElement | null, storageKey: string) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [toolbar, setToolbar] = useState<Toolbar | null>(null);
  const [enabled, setEnabled] = useState(false);
  const id = useRef(`${Math.random()}`);
  // Per page as well as per article: the same passage may appear twice.
  const key = useRef(storageKey);
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const roots = useCallback(() => {
    const passage = scroller?.querySelector('[data-reading-passage]');
    return passage ? paragraphRoots(passage) : [];
  }, [scroller]);

  // Load once mounted; the key names this page and article.
  useEffect(() => {
    if (!supported()) return;
    key.current = `${storageKey}@${location.pathname}`;
    installStyle();
    setEnabled(true);
    setMarks(read(key.current));
  }, [storageKey]);

  // Paint whenever the marks change.
  useEffect(() => {
    if (!enabled) return;
    const list = roots();
    registry.set(id.current, marks.flatMap((mark) => toRange(list, mark) ?? []));
    paint();
  }, [enabled, marks, roots]);

  useEffect(() => () => {
    registry.delete(id.current);
    paint();
  }, []);

  const commit = useCallback((next: Mark[]) => {
    setMarks(next);
    write(key.current, next);
    setToolbar(null);
  }, []);

  // A finished selection (or a tap on a highlight) opens the toolbar above it.
  useEffect(() => {
    if (!enabled || !scroller) return;
    let pressed: { x: number; y: number } | null = null;

    const open = (event: PointerEvent) => {
      const start = pressed;
      pressed = null;
      const selection = document.getSelection();
      const list = roots();
      const passage = scroller.querySelector('[data-reading-passage]');
      if (!passage) return;
      if (selection && !selection.isCollapsed && selection.rangeCount) {
        const range = selection.getRangeAt(0);
        if (!passage.contains(range.commonAncestorContainer) && !range.intersectsNode(passage)) return;
        const picked = toMarks(list, range);
        if (!picked.length) return;
        const box = range.getBoundingClientRect();
        setToolbar({
          x: box.left + box.width / 2,
          y: box.top,
          range: range.cloneRange(),
          selection: picked,
          marks: marksRef.current.filter((mark) => picked.some((part) => overlaps(mark, part))),
        });
        return;
      }
      // A tap (not a drag) on highlighted text offers to clear it.
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      const point = markAtPoint(list, event.clientX, event.clientY);
      const hit = point ? marksRef.current.filter((mark) => overlaps(mark, point)) : [];
      if (hit.length) setToolbar({ x: event.clientX, y: event.clientY - 8, selection: [], marks: hit });
    };
    const down = (event: PointerEvent) => {
      if ((event.target as Element).closest('button')) return;
      pressed = { x: event.clientX, y: event.clientY };
      setToolbar(null);
    };
    // Let the selection settle (touch handles, double-click) before reading it.
    const up = (event: PointerEvent) => window.setTimeout(() => open(event), 10);
    // Scrolling carries a selection's menu along; a tap's menu closes.
    const close = () => setToolbar((previous) => {
      if (!previous?.range) return null;
      const box = previous.range.getBoundingClientRect();
      const pane = scroller.getBoundingClientRect();
      if (box.bottom < pane.top || box.top > pane.bottom) return null;
      return { ...previous, x: box.left + box.width / 2, y: box.top };
    });
    scroller.addEventListener('pointerdown', down);
    scroller.addEventListener('pointerup', up);
    scroller.addEventListener('scroll', close, { passive: true });
    window.addEventListener('scroll', close, { passive: true, capture: true });
    return () => {
      scroller.removeEventListener('pointerdown', down);
      scroller.removeEventListener('pointerup', up);
      scroller.removeEventListener('scroll', close);
      window.removeEventListener('scroll', close, { capture: true });
    };
  }, [enabled, roots, scroller]);

  // Esc closes the toolbar.
  useEffect(() => {
    if (!toolbar) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToolbar(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toolbar]);

  const add = () => {
    if (!toolbar) return;
    commit(merge(marksRef.current, toolbar.selection));
    document.getSelection()?.removeAllRanges();
  };
  const remove = () => {
    if (!toolbar) return;
    commit(marksRef.current.filter((mark) => !toolbar.marks.includes(mark)));
    document.getSelection()?.removeAllRanges();
  };
  const clear = useCallback(() => commit([]), [commit]);

  const menu = toolbar && typeof document !== 'undefined'
    ? createPortal(
      <div
        role="toolbar"
        aria-label="高亮"
        className={styles.markMenu}
        style={{ left: Math.min(Math.max(toolbar.x, 72), window.innerWidth - 72), top: Math.max(toolbar.y, 52) }}
        onPointerDown={(event) => event.preventDefault()}
      >
        {toolbar.selection.length ? (
          <button type="button" onClick={add}><HighlighterIcon aria-hidden="true" />高亮</button>
        ) : null}
        {toolbar.marks.length ? (
          <button type="button" onClick={remove}><EraserIcon aria-hidden="true" />清除</button>
        ) : null}
      </div>,
      document.body,
    )
    : null;

  return { enabled, count: marks.length, clear, menu };
}
