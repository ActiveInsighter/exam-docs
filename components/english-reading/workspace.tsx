'use client';

import { ArrowRightIcon, BookOpenTextIcon, LanguagesIcon, ListChecksIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import {
  type CSSProperties,
  type RefObject,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { PAGE_QUESTION_STATUS_TEXT } from '@/components/question/page-questions';
import { type NavItem, useQuestionNav } from './use-question-nav';
import styles from './reading.module.css';

type View = 'article' | 'questions';

/* Share of the card given to the article, in percent. */
const SPLIT_DEFAULT = 55;
const SPLIT_MIN = 34;
const SPLIT_MAX = 68;
const SPLIT_STORAGE_KEY = 'exam-reading-split';

const clampSplit = (value: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(value * 10) / 10));

/** The element that scrolls the document around the card. */
function pageScroller(node: HTMLElement): HTMLElement {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
      return element;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Bottom edge of the sticky/fixed site header, when the window scrolls. */
function stickyHeaderBottom() {
  let bottom = 0;
  for (const header of document.querySelectorAll<HTMLElement>('body header')) {
    const position = getComputedStyle(header).position;
    if (position !== 'sticky' && position !== 'fixed') continue;
    const box = header.getBoundingClientRect();
    if (box.height > 0 && box.top <= 1) bottom = Math.max(bottom, box.bottom);
  }
  return bottom;
}

/**
 * How far the page must scroll so the card sits fully in view below the docs
 * header (centred when there is spare room). Zero when already docked.
 */
function dockDistance(card: HTMLElement) {
  const scroller = pageScroller(card);
  const isDocument = scroller === document.scrollingElement;
  const visibleTop = isDocument
    ? stickyHeaderBottom()
    : scroller.getBoundingClientRect().top + (Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0);
  const visibleHeight = (isDocument ? window.innerHeight : scroller.getBoundingClientRect().bottom) - visibleTop;
  const box = card.getBoundingClientRect();
  const target = visibleTop + Math.max(0, (visibleHeight - box.height) / 2);
  return { scroller, distance: box.top - target };
}

/** True when the panes scroll on their own (side-by-side or focus mode). */
function scrollsInside(element: HTMLElement | null) {
  return !!element && /(auto|scroll)/.test(getComputedStyle(element).overflowY);
}

function useSplit() {
  const [split, setSplit] = useState(SPLIT_DEFAULT);

  useEffect(() => {
    const stored = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0) setSplit(clampSplit(stored));
  }, []);

  const commit = useCallback((value: number) => {
    const next = clampSplit(value);
    setSplit(next);
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(next));
    } catch {
      // Private mode: the width simply resets on the next visit.
    }
  }, []);

  return [split, setSplit, commit] as const;
}

/** Numbered paragraphs of the passage: authored <Paragraph>s or bare <p>s. */
const PARAGRAPHS = ':scope > p, :scope > [data-reading-paragraph]';

/** Paragraphs, words and an estimated reading time, read from the passage. */
function useArticleStats(ref: RefObject<HTMLElement | null>) {
  const [stats, setStats] = useState<string | null>(null);
  useEffect(() => {
    const passage = ref.current?.querySelector<HTMLElement>('[data-reading-passage]');
    if (!passage) return;
    const paragraphs = passage.querySelectorAll(PARAGRAPHS).length;
    // Count the English only, never the hidden translations.
    const english = passage.cloneNode(true) as HTMLElement;
    english.querySelectorAll('[data-reading-translation]').forEach((node) => node.remove());
    const words = (english.textContent ?? '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
    if (words === 0) return;
    // A brisk exam reading pace of about 150 words per minute.
    setStats(`${paragraphs} 段 · ${words} 词 · 约 ${Math.max(1, Math.round(words / 150))} 分钟`);
  }, [ref]);
  return stats;
}

function QuestionNav({
  items,
  active,
  onPick,
}: {
  items: NavItem[];
  active: string | null;
  onPick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="题目导航" className={styles.nav}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.navItem}
          data-status={item.status}
          aria-current={item.id === active ? 'true' : undefined}
          aria-label={`第 ${item.label} 题，${PAGE_QUESTION_STATUS_TEXT[item.status]}`}
          title={`第 ${item.label} 题 · ${PAGE_QUESTION_STATUS_TEXT[item.status]}`}
          onClick={() => onPick(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function TranslationToggle({ on, onToggle, className, compact }: {
  on: boolean;
  onToggle: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(compact ? styles.iconButton : styles.translateButton, className)}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={compact ? (on ? '隐藏对照翻译' : '显示对照翻译') : undefined}
      title={on ? '隐藏对照翻译' : '逐段显示中英对照翻译'}
    >
      <LanguagesIcon aria-hidden="true" />
      {compact ? null : '翻译'}
    </button>
  );
}

function FocusToggle({ focus, onToggle, className }: { focus: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={cn(styles.iconButton, className)}
      onClick={onToggle}
      aria-pressed={focus}
      data-reading-focus-toggle=""
      aria-label={focus ? '退出专注模式' : '专注模式'}
      title={focus ? '退出专注模式 (Esc)' : '专注模式'}
    >
      {focus ? <Minimize2Icon /> : <Maximize2Icon />}
    </button>
  );
}

/**
 * The reading card.
 *
 * Wide containers: article and questions side by side, each pane scrolling on
 * its own inside a card sized to the viewport, with a draggable divider.
 * Narrow containers: one pane at a time behind a sticky 原文 / 题目 switch,
 * scrolling with the page. Focus mode lifts the card above the page.
 * The 翻译 toggle (beside 原文) reveals each paragraph's Chinese translation.
 */
export function ReadingWorkspace({
  article,
  translatable = false,
  children,
}: {
  article: ReactNode;
  /** The article carries <Translation>s, so the 翻译 toggle is offered. */
  translatable?: boolean;
  children: ReactNode;
}) {
  const baseId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('article');
  const [focus, setFocus] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [split, setSplit, commitSplit] = useSplit();
  const { items, active, pin } = useQuestionNav(questionsRef);
  const stats = useArticleStats(articleRef);
  const answered = items.filter((item) => item.status !== 'idle' && item.status !== 'draft').length;
  const correct = items.filter((item) => item.status === 'correct').length;

  // Narrow layout: each view keeps its own page scroll position.
  const pagePositions = useRef<Partial<Record<View, number>>>({});
  const pendingRestore = useRef<View | null>(null);

  const switchView = useCallback((next: View) => {
    if (next === view) return;
    const card = cardRef.current;
    if (card && !scrollsInside(articleRef.current)) {
      pagePositions.current[view] = pageScroller(card).scrollTop;
      pendingRestore.current = next;
    }
    setView(next);
  }, [view]);

  useLayoutEffect(() => {
    const target = pendingRestore.current;
    pendingRestore.current = null;
    const card = cardRef.current;
    if (!target || !card) return;
    const scroller = pageScroller(card);
    const viewportTop = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
    const offset = Number.parseFloat(getComputedStyle(card).scrollMarginTop) || 0;
    // The card's own top, so a switch never lands above the card.
    const floor = card.getBoundingClientRect().top - viewportTop + scroller.scrollTop - offset;
    const saved = pagePositions.current[target];
    if (saved !== undefined) scroller.scrollTop = Math.max(saved, floor);
    else if (scroller.scrollTop > floor) scroller.scrollTop = floor;
  }, [view]);

  /*
   * Showing or hiding translations reflows the passage. Keep the paragraph at
   * the top of the visible article where it was, so the reader never loses
   * their place (native scroll anchoring is off on the passage for this).
   */
  const anchor = useRef<{ node: HTMLElement; top: number } | null>(null);

  const toggleTranslation = useCallback(() => {
    const scroller = articleRef.current;
    const card = cardRef.current;
    if (scroller && card) {
      const visibleTop = scrollsInside(scroller)
        ? scroller.getBoundingClientRect().top
        : Math.max(0, card.querySelector('[data-reading-switcher]')?.getBoundingClientRect().bottom ?? 0);
      const passage = scroller.querySelector('[data-reading-passage]');
      const node = Array.from(passage?.querySelectorAll<HTMLElement>(PARAGRAPHS) ?? [])
        .find((paragraph) => paragraph.getBoundingClientRect().bottom > visibleTop);
      anchor.current = node ? { node, top: node.getBoundingClientRect().top } : null;
    }
    setTranslated((on) => !on);
  }, []);

  useLayoutEffect(() => {
    const saved = anchor.current;
    anchor.current = null;
    const card = cardRef.current;
    if (!saved || !card || !saved.node.isConnected) return;
    const shift = saved.node.getBoundingClientRect().top - saved.top;
    if (Math.abs(shift) < 1) return;
    const scroller = scrollsInside(articleRef.current) ? articleRef.current! : pageScroller(card);
    scroller.scrollTop += shift;
  }, [translated]);

  const pickQuestion = useCallback((id: string) => {
    const pane = questionsRef.current;
    const target = pane?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!pane || !target) return;
    pin(id);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';

    // Keyboard users land on the first answer control of the picked question.
    const focusAnswer = () => target
      .querySelector<HTMLElement>('[data-exam-choice-option]:not([disabled]), input:not([disabled])')
      ?.focus({ preventScroll: true });

    if (scrollsInside(pane)) {
      const top = target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
      pane.scrollTo({ top: Math.max(0, top - 12), behavior });
      const card = cardRef.current;
      if (!focus && card) {
        const { scroller, distance } = dockDistance(card);
        if (Math.abs(distance) > 1) scroller.scrollBy({ top: distance, behavior });
      }
      focusAnswer();
    } else {
      switchView('questions');
      // The pane becomes visible on the next frame.
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'start', behavior });
        focusAnswer();
      });
    }
  }, [focus, pin, switchView]);

  /*
   * Side by side, a wheel over the card first docks the card fully in view
   * (scrolling the page), and only then scrolls the pane under the pointer.
   * At either end of a pane native chaining carries on to the page.
   */
  useEffect(() => {
    const card = cardRef.current;
    if (!card || focus) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      if (!scrollsInside(articleRef.current)) return;
      const { scroller, distance } = dockDistance(card);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      // Only intercept while moving towards the docked position, and only
      // while the page can still move that way.
      if (Math.abs(distance) <= 1 || Math.sign(delta) !== Math.sign(distance)) return;
      const room = delta > 0 ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop : scroller.scrollTop;
      if (room < 1) return;
      event.preventDefault();
      const step = Math.sign(delta) * Math.min(Math.abs(delta), Math.abs(distance));
      scroller.scrollBy({ top: step });
    };
    card.addEventListener('wheel', onWheel, { passive: false });
    return () => card.removeEventListener('wheel', onWheel);
  }, [focus]);

  // Focus mode: Esc leaves (unless a solution dialog is handling it); focus
  // moves into the card and returns to where it was on exit.
  useEffect(() => {
    if (!focus) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[data-slot="dialog-content"], [data-slot="modal-content"]')) return;
      setFocus(false);
    };
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      // The toggle that opened focus mode is unmounted/moved; find its twin.
      const visibleToggle = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('[data-reading-focus-toggle]') ?? [])
        .find((toggle) => toggle.getClientRects().length > 0);
      const target = returnTo?.isConnected && returnTo.getClientRects().length > 0 ? returnTo : visibleToggle;
      target?.focus({ preventScroll: true });
    };
  }, [focus]);

  const toggleFocus = useCallback(() => {
    if (focus) {
      // Back in the page: dock the card where focus mode left it.
      requestAnimationFrame(() => {
        const card = cardRef.current;
        if (!card) return;
        const { scroller, distance } = dockDistance(card);
        scroller.scrollBy({ top: distance });
      });
    }
    setFocus(!focus);
  }, [focus]);

  // Divider: pointer drag, arrow keys, double-click to reset.
  const dragFrom = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  };
  const dragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizing || !panesRef.current) return;
    const box = panesRef.current.getBoundingClientRect();
    setSplit(clampSplit(((event.clientX - box.left) / box.width) * 100));
  };
  const dragEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
    commitSplit(split);
  };
  const resizeByKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 8 : 2;
    const next =
      event.key === 'ArrowLeft' ? split - step
      : event.key === 'ArrowRight' ? split + step
      : event.key === 'Home' ? SPLIT_MIN
      : event.key === 'End' ? SPLIT_MAX
      : event.key === 'Enter' ? SPLIT_DEFAULT
      : null;
    if (next === null) return;
    event.preventDefault();
    commitSplit(next);
  };

  const articleId = `${baseId}-article`;
  const questionsId = `${baseId}-questions`;
  const progress = items.length > 0 ? `${answered}/${items.length}` : null;

  return (
    <>
      {focus ? <div className={styles.backdrop} aria-hidden="true" onClick={toggleFocus} /> : null}
      <section
        ref={cardRef}
        className={styles.card}
        data-english-reading=""
        data-view={view}
        data-focus={focus ? '' : undefined}
        data-resizing={resizing ? '' : undefined}
        data-translation={translated ? '' : undefined}
        tabIndex={-1}
        aria-label="英语阅读理解"
      >
        {/* Narrow layouts: one pane at a time. */}
        <div className={styles.switcher} data-reading-switcher="" data-reading-sticky="">
          <div role="tablist" aria-label="切换原文与题目" className={styles.segments}>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'article'}
              aria-controls={articleId}
              className={styles.segment}
              onClick={() => switchView('article')}
            >
              <BookOpenTextIcon aria-hidden="true" />
              原文
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'questions'}
              aria-controls={questionsId}
              className={styles.segment}
              onClick={() => switchView('questions')}
            >
              <ListChecksIcon aria-hidden="true" />
              题目
              {progress ? <span className={styles.segmentCount}>{progress}</span> : null}
            </button>
          </div>
          {translatable ? (
            <TranslationToggle on={translated} onToggle={toggleTranslation} className={styles.switcherTranslate} compact />
          ) : null}
          <FocusToggle focus={focus} onToggle={toggleFocus} />
        </div>

        <div
          ref={panesRef}
          className={styles.panes}
          style={{ '--reading-split': `${split}%` } as CSSProperties}
        >
          <div className={styles.pane} data-pane="article" id={articleId}>
            <div className={styles.paneHeader}>
              <span className={styles.paneLabel}>
                <BookOpenTextIcon aria-hidden="true" />
                原文
              </span>
              {translatable ? <TranslationToggle on={translated} onToggle={toggleTranslation} /> : null}
              {stats ? <span className={styles.stats}>{stats}</span> : null}
            </div>
            <div className={styles.progress} aria-hidden="true"><span /></div>
            <div ref={articleRef} className={styles.scroller} data-reading-article="" tabIndex={-1}>
              {article}
              <button type="button" className={styles.startButton} onClick={() => switchView('questions')}>
                开始答题
                <ArrowRightIcon aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-controls={articleId}
            aria-label="调整原文与题目的宽度"
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            className={styles.divider}
            onPointerDown={dragFrom}
            onPointerMove={dragMove}
            onPointerUp={dragEnd}
            onPointerCancel={dragEnd}
            onKeyDown={resizeByKey}
            onDoubleClick={() => commitSplit(SPLIT_DEFAULT)}
          />

          <div className={styles.pane} data-pane="questions" id={questionsId}>
            <div className={styles.paneHeader} data-reading-sticky="">
              <span className={styles.paneLabel}>
                <ListChecksIcon aria-hidden="true" />
                题目
              </span>
              <QuestionNav items={items} active={active} onPick={pickQuestion} />
              {progress ? (
                <span className={styles.score} aria-live="polite">
                  已答 {progress}
                  {answered > 0 ? <span className={styles.scoreCorrect}> · 对 {correct}</span> : null}
                </span>
              ) : null}
              <FocusToggle focus={focus} onToggle={toggleFocus} className={styles.headerFocus} />
            </div>
            <div ref={questionsRef} className={styles.scroller} data-reading-questions="">
              {children}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
