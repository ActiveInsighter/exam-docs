'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  CrosshairIcon,
  EraserIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  TextQuoteIcon,
  UndoDotIcon,
} from 'lucide-react';
import {
  type CSSProperties,
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
import {
  PAGE_QUESTION_STATUS_TEXT,
  QUESTION_SELECTOR,
  REVEAL_QUESTION_EVENT,
  readPageQuestions,
  samePageQuestions,
  type PageQuestion,
} from '@/components/question/page-questions';
import { PASSAGE_PARAGRAPHS, useHighlights } from './use-highlights';
import styles from './reading.module.css';

/*
 * The reading card, laid out like a computer-based reading test.
 *
 *   wide (card ≥ 48rem)   passage left, one question at a time right, each
 *                         pane scrolling on its own; a draggable divider
 *   narrow                原文 / 题目 switch in a bar that sticks under the
 *                         docs header; the page scrolls
 *
 * Passage tools: 译 (every paragraph's translation; a paragraph number
 * shows that paragraph's alone), text size, and a highlighter
 * (use-highlights). Question tools: the answer-sheet strip, 上一题 / 下一题,
 * links to the paragraphs a question names ("Paragraph 3"), and, once a
 * question is graded, 原文定位 to the <Evidence> it is answered from.
 *
 * Every question stays mounted (its state, the solution deck and the
 * floating dock read them from the page); the ones not shown are only out
 * of layout. Navigators ask for one with revealQuestion (page-questions).
 */

type View = 'article' | 'questions';
type Status = PageQuestion['status'];

const SPLIT_DEFAULT = 54;
const SPLIT_MIN = 34;
const SPLIT_MAX = 68;
const SPLIT_KEY = 'exam-reading-split';
const SIZE_KEY = 'exam-reading-size';
const SIZES = ['小', '中', '大'] as const;

const clampSplit = (value: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(value * 10) / 10));
const graded = (status: Status | undefined) => status === 'correct' || status === 'partial' || status === 'incorrect';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readNumber(key: string) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && localStorage.getItem(key) !== null ? value : null;
  } catch {
    return null;
  }
}

function store(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode: the preference lasts for this visit.
  }
}

/** A setting kept across visits (pane split, text size). */
function useStored(key: string, initial: number, clamp: (value: number) => number) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const stored = readNumber(key);
    if (stored !== null) setValue(clamp(stored));
  }, [key, clamp]);
  const commit = useCallback((next: number) => {
    const clamped = clamp(next);
    setValue(clamped);
    store(key, clamped);
  }, [key, clamp]);
  return [value, setValue, commit] as const;
}

const clampSize = (value: number) => Math.min(SIZES.length - 1, Math.max(0, Math.round(value)));

/** The element that scrolls the document around the card. */
function pageScroller(node: HTMLElement): HTMLElement {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) return element;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** True when the panes scroll on their own (side by side, or focus mode). */
function scrollsInside(element: HTMLElement | null) {
  return !!element && /(auto|scroll)/.test(getComputedStyle(element).overflowY);
}

/** Brings the whole card into view when it is partly off screen. */
function bringIntoView(card: HTMLElement) {
  const box = card.getBoundingClientRect();
  if (box.top >= 0 && box.bottom <= window.innerHeight) return;
  card.scrollIntoView({ block: box.height > window.innerHeight ? 'start' : 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

/** A brief glow on what a locate jumped to. */
function flash(element: HTMLElement) {
  element.removeAttribute('data-flash');
  // Restart the animation on repeated jumps.
  void element.offsetWidth;
  element.setAttribute('data-flash', '');
  element.addEventListener('animationend', () => element.removeAttribute('data-flash'), { once: true });
}

/** Paragraph numbers a question names: "Paragraph 3", "Para. 2", "第 4 段". */
function paragraphRefs(question: Element | null, count: number) {
  const stem = question?.querySelector('[data-exam-question-body]')?.cloneNode(true) as HTMLElement | undefined;
  if (!stem) return [];
  stem.querySelectorAll('[data-exam-choice-group], [data-exam-boolean]').forEach((node) => node.remove());
  const found = new Set<number>();
  for (const match of (stem.textContent ?? '').matchAll(/\b(?:Paragraphs?|Paras?\.?)\s*(\d+)(?:\s*(?:and|&|-|–|to)\s*(\d+))?|第\s*(\d+)\s*段/gi)) {
    for (const value of [match[1], match[2], match[3]]) {
      const number = Number(value);
      if (number >= 1 && number <= count) found.add(number);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** The questions in the card and their results, read from the rendered cards. */
function useQuestions(ref: React.RefObject<HTMLElement | null>) {
  const [items, setItems] = useState<PageQuestion[]>([]);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setItems((previous) => {
        const next = readPageQuestions(container);
        return samePageQuestions(previous, next) ? previous : next;
      });
    };
    read();
    const observer = new MutationObserver(() => {
      frame ||= requestAnimationFrame(read);
    });
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-attempt-result'] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref]);
  return items;
}

/** Paragraphs, words and an estimated reading time. */
function useArticleStats(ref: React.RefObject<HTMLElement | null>) {
  const [stats, setStats] = useState<{ paragraphs: number; words: number } | null>(null);
  useEffect(() => {
    const passage = ref.current?.querySelector<HTMLElement>('[data-reading-passage]');
    if (!passage) return;
    const english = passage.cloneNode(true) as HTMLElement;
    english.querySelectorAll('[data-reading-translation]').forEach((node) => node.remove());
    const words = (english.textContent ?? '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
    setStats({ paragraphs: passage.querySelectorAll(PASSAGE_PARAGRAPHS).length, words });
  }, [ref]);
  return stats;
}

function ToolButton({ label, pressed, disabled, onClick, children, className, ...rest }: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <button
      type="button"
      className={cn(styles.tool, className)}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

function SheetStrip({ items, current, onPick }: { items: PageQuestion[]; current: string | null; onPick: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="题目导航" className={styles.sheet}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.sheetItem}
          data-status={item.status}
          aria-current={item.id === current ? 'step' : undefined}
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

export function ReadingWorkspace({
  article,
  translatable = false,
  storageKey,
  children,
}: {
  article: ReactNode;
  /** The article carries <Translation>s, so the 译 switch is offered. */
  translatable?: boolean;
  /** Names this article for the reader's highlights. */
  storageKey: string;
  children: ReactNode;
}) {
  const baseId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);
  const questionScrollRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>('article');
  const [focus, setFocus] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  /* Narrow layout, after 原文定位: the question to come back to. */
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [split, setSplit, commitSplit] = useStored(SPLIT_KEY, SPLIT_DEFAULT, clampSplit);
  const [size, , commitSize] = useStored(SIZE_KEY, 1, clampSize);

  const items = useQuestions(questionsRef);
  const stats = useArticleStats(articleRef);
  const marks = useHighlights(articleRef, `exam-reading-marks:${storageKey}`);

  const index = Math.max(0, items.findIndex((item) => item.id === current));
  const item = items[index];
  const answered = items.filter((entry) => graded(entry.status)).length;
  const correct = items.filter((entry) => entry.status === 'correct').length;

  // The question shown: the first until the reader picks another.
  const shownId = item?.id ?? null;

  /** Shows one question and hides the rest, in the DOM at once (no render needed). */
  const display = useCallback((id: string | null) => {
    const container = questionsRef.current;
    if (!container || !id) return;
    for (const question of container.querySelectorAll<HTMLElement>(QUESTION_SELECTOR)) {
      question.toggleAttribute('data-reading-current', question.id === id);
    }
  }, []);

  useLayoutEffect(() => {
    display(shownId);
    cardRef.current?.setAttribute('data-ready', '');
  }, [display, shownId]);

  const narrow = () => !scrollsInside(articleRef.current);

  /** Moves to a question: shown, scrolled to its top, and in view. */
  const show = useCallback((id: string, { focusAnswer = false } = {}) => {
    const container = questionsRef.current;
    const target = container?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    display(id);
    setCurrent(id);
    setReturnTo(null);
    const card = cardRef.current;
    if (narrow()) {
      setView('questions');
      requestAnimationFrame(() => {
        const bar = card?.querySelector<HTMLElement>('[data-reading-bar]')?.getBoundingClientRect().bottom ?? 0;
        const top = target.getBoundingClientRect().top;
        if (top < bar || top > window.innerHeight * 0.6) {
          const scroller = pageScroller(card!);
          scroller.scrollBy({ top: top - bar - 64, behavior: 'auto' });
        }
      });
    } else {
      questionScrollRef.current?.scrollTo({ top: 0 });
      if (card && !focus) bringIntoView(card);
    }
    if (focusAnswer) {
      requestAnimationFrame(() => target
        .querySelector<HTMLElement>('[data-exam-choice-option]:not([aria-disabled="true"]), [data-boolean-option], input:not([disabled])')
        ?.focus({ preventScroll: true }));
    }
  }, [display, focus]);

  // Navigators elsewhere (the floating dock, the solution card, #links) ask
  // for a question through revealQuestion; take over and show it here.
  useEffect(() => {
    const container = questionsRef.current;
    if (!container) return;
    const onReveal = (event: Event) => {
      const question = (event.target as Element).closest<HTMLElement>(QUESTION_SELECTOR);
      if (!question || !container.contains(question)) return;
      event.preventDefault();
      show(question.id);
    };
    container.addEventListener(REVEAL_QUESTION_EVENT, onReveal);
    return () => container.removeEventListener(REVEAL_QUESTION_EVENT, onReveal);
  }, [show]);

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && questionsRef.current?.querySelector(`[id="${CSS.escape(id)}"]`)) show(id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [show]);

  const step = (delta: number) => {
    const next = items[index + delta];
    if (next) show(next.id);
  };

  /* ---- Evidence and paragraph links ---- */

  const passage = () => articleRef.current?.querySelector<HTMLElement>('[data-reading-passage]');
  /** <Evidence for> names the question's own id; the card's DOM id is question-<id>. */
  const evidenceOf = (id: string | null) => {
    const question = id ? questionsRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) : null;
    const key = question?.dataset.questionId;
    return key ? Array.from(passage()?.querySelectorAll<HTMLElement>(`[data-reading-evidence="${CSS.escape(key)}"]`) ?? []) : [];
  };

  const shownGraded = graded(item?.status);
  const [hasEvidence, setHasEvidence] = useState(false);
  const [refs, setRefs] = useState<number[]>([]);

  // The shown question's evidence is marked in the passage once it is graded.
  useEffect(() => {
    const root = passage();
    if (!root) return;
    root.querySelectorAll('[data-lit]').forEach((node) => node.removeAttribute('data-lit'));
    const evidence = evidenceOf(shownId);
    setHasEvidence(evidence.length > 0);
    if (shownGraded) evidence.forEach((node) => node.setAttribute('data-lit', ''));
    const question = shownId ? questionsRef.current?.querySelector(`[id="${CSS.escape(shownId)}"]`) ?? null : null;
    setRefs(paragraphRefs(question, root.querySelectorAll(PASSAGE_PARAGRAPHS).length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownId, shownGraded]);

  /** Scrolls the passage to an element (evidence or a paragraph) and makes it glow. */
  const reveal = (target: HTMLElement | undefined) => {
    const scroller = articleRef.current;
    const card = cardRef.current;
    if (!target || !scroller || !card) return;
    const behavior: ScrollBehavior = reduceMotion() ? 'auto' : 'smooth';
    if (narrow()) {
      if (shownId) setReturnTo(shownId);
      setView('article');
      requestAnimationFrame(() => {
        const bar = card.querySelector<HTMLElement>('[data-reading-bar]')?.getBoundingClientRect().bottom ?? 0;
        pageScroller(card).scrollBy({ top: target.getBoundingClientRect().top - bar - window.innerHeight * 0.2, behavior });
        flash(target);
      });
      return;
    }
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight * 0.28), behavior });
    if (!focus) bringIntoView(card);
    flash(target);
  };

  const locateEvidence = () => reveal(evidenceOf(shownId)[0]);
  const locateParagraph = (number: number) =>
    reveal(passage()?.querySelectorAll<HTMLElement>(PASSAGE_PARAGRAPHS)[number - 1]);

  const backToQuestion = () => {
    const id = returnTo;
    setReturnTo(null);
    if (id) show(id);
  };

  /* ---- Translation ---- */

  /*
   * Showing or hiding translations reflows the passage. Keep the paragraph at
   * the top of the visible article where it was (native scroll anchoring is
   * off on the passage for this).
   */
  const anchor = useRef<{ node: HTMLElement; top: number } | null>(null);
  const keepPlace = () => {
    const scroller = articleRef.current;
    const card = cardRef.current;
    if (!scroller || !card) return;
    const visibleTop = scrollsInside(scroller)
      ? scroller.getBoundingClientRect().top
      : card.querySelector('[data-reading-bar]')?.getBoundingClientRect().bottom ?? 0;
    const node = Array.from(passage()?.querySelectorAll<HTMLElement>(PASSAGE_PARAGRAPHS) ?? [])
      .find((paragraph) => paragraph.getBoundingClientRect().bottom > visibleTop);
    anchor.current = node ? { node, top: node.getBoundingClientRect().top } : null;
  };

  const toggleTranslation = () => {
    keepPlace();
    setTranslated((on) => !on);
  };

  const changeSize = (delta: number) => {
    keepPlace();
    commitSize(size + delta);
  };

  useLayoutEffect(() => {
    const saved = anchor.current;
    anchor.current = null;
    const card = cardRef.current;
    if (!saved || !card || !saved.node.isConnected) return;
    const shift = saved.node.getBoundingClientRect().top - saved.top;
    if (Math.abs(shift) < 1) return;
    const scroller = scrollsInside(articleRef.current) ? articleRef.current! : pageScroller(card);
    scroller.scrollTop += shift;
  }, [translated, size]);

  // A translated paragraph's number shows or hides that paragraph's Chinese.
  const onArticleClick = (event: React.MouseEvent) => {
    const toggle = (event.target as Element).closest<HTMLElement>('[data-reading-paragraph-toggle]');
    const paragraph = toggle?.closest<HTMLElement>('[data-reading-paragraph]');
    if (!toggle || !paragraph) return;
    const open = !paragraph.hasAttribute('data-open');
    paragraph.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  /* ---- Focus mode ---- */

  useEffect(() => {
    if (!focus) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      const toggle = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('[data-reading-focus-toggle]') ?? [])
        .find((node) => node.getClientRects().length > 0);
      const target = returnFocus?.isConnected && returnFocus.getClientRects().length > 0 ? returnFocus : toggle;
      target?.focus({ preventScroll: true });
      requestAnimationFrame(() => { if (cardRef.current) bringIntoView(cardRef.current); });
    };
  }, [focus]);

  /* ---- Divider: drag, arrow keys, double-click to reset ---- */

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
    const by = event.shiftKey ? 8 : 2;
    const next =
      event.key === 'ArrowLeft' ? split - by
      : event.key === 'ArrowRight' ? split + by
      : event.key === 'Home' ? SPLIT_MIN
      : event.key === 'End' ? SPLIT_MAX
      : event.key === 'Enter' ? SPLIT_DEFAULT
      : null;
    if (next === null) return;
    event.preventDefault();
    commitSplit(next);
  };

  /* ---- Render ---- */

  const articleId = `${baseId}-article`;
  const questionsId = `${baseId}-questions`;
  const progress = items.length ? `${answered}/${items.length}` : null;
  const last = index >= items.length - 1;

  const passageTools = (
    <>
      {translatable ? (
        <ToolButton label={translated ? '隐藏中文翻译' : '显示中文翻译'} pressed={translated} onClick={toggleTranslation} className={styles.toolText}>
          <span aria-hidden="true" className={styles.glyph}>译</span>
        </ToolButton>
      ) : null}
      <span className={styles.sizeGroup} role="group" aria-label={`字号：${SIZES[size]}`}>
        <ToolButton label="减小字号" onClick={() => changeSize(-1)} disabled={size === 0}>
          <span aria-hidden="true" className={styles.glyphSmall}>A</span>
        </ToolButton>
        <ToolButton label="增大字号" onClick={() => changeSize(1)} disabled={size === SIZES.length - 1}>
          <span aria-hidden="true" className={styles.glyph}>A</span>
        </ToolButton>
      </span>
      {marks.count ? (
        <ToolButton label={`清除全部 ${marks.count} 处高亮`} onClick={marks.clear}>
          <EraserIcon aria-hidden="true" />
        </ToolButton>
      ) : null}
    </>
  );

  const focusToggle = (
    <ToolButton label={focus ? '退出专注模式' : '专注模式'} pressed={focus} onClick={() => setFocus(!focus)} data-reading-focus-toggle="">
      {focus ? <Minimize2Icon aria-hidden="true" /> : <Maximize2Icon aria-hidden="true" />}
    </ToolButton>
  );

  return (
    <>
      {focus ? <div className={styles.backdrop} aria-hidden="true" onClick={() => setFocus(false)} /> : null}
      <section
        ref={cardRef}
        className={styles.card}
        data-english-reading=""
        data-view={view}
        data-focus={focus ? '' : undefined}
        data-resizing={resizing ? '' : undefined}
        data-translation={translated ? '' : undefined}
        data-size={size}
        tabIndex={-1}
        aria-label="英语阅读理解"
      >
        {/* Narrow layouts: one pane at a time, switched from a sticky bar. */}
        <div className={styles.bar} data-reading-bar="">
          <div role="tablist" aria-label="切换原文与题目" className={styles.segments}>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'article'}
              aria-controls={articleId}
              className={styles.segment}
              onClick={() => setView('article')}
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
              onClick={() => { setReturnTo(null); setView('questions'); }}
            >
              <ListChecksIcon aria-hidden="true" />
              题目
              {progress ? <span className={styles.segmentCount}>{progress}</span> : null}
            </button>
          </div>
          <div className={styles.barTools} data-view-tools={view}>
            {view === 'article' ? passageTools : null}
            {focusToggle}
          </div>
        </div>

        <div ref={panesRef} className={styles.panes} style={{ '--reading-split': `${split}%` } as CSSProperties}>
          <div className={styles.pane} data-pane="article" id={articleId}>
            <div className={styles.paneHead}>
              <span className={styles.paneTitle}>
                <BookOpenTextIcon aria-hidden="true" />
                原文
              </span>
              {stats ? (
                <span className={styles.stats}>
                  {stats.paragraphs} 段 · {stats.words} 词 · 约 {Math.max(1, Math.round(stats.words / 150))} 分钟
                </span>
              ) : null}
              <span className={styles.paneTools}>{passageTools}</span>
            </div>
            <div className={styles.progress} aria-hidden="true"><span /></div>
            <div ref={articleRef} className={styles.scroller} data-reading-article="" tabIndex={-1} onClick={onArticleClick}>
              {article}
              {marks.enabled ? <p className={styles.hint}>选中文字可高亮，点按高亮处可清除。</p> : null}
            </div>
            {returnTo ? (
              <button type="button" className={styles.returnPill} onClick={backToQuestion}>
                <UndoDotIcon aria-hidden="true" />
                回到第 {items.find((entry) => entry.id === returnTo)?.label} 题
              </button>
            ) : null}
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
            <div className={styles.paneHead}>
              <SheetStrip items={items} current={shownId} onPick={(id) => show(id, { focusAnswer: true })} />
              {progress ? (
                <span className={styles.score} aria-live="polite">
                  已答 {progress}
                  {answered ? <> · <span className={styles.scoreCorrect}>对 {correct}</span></> : null}
                </span>
              ) : null}
              <span className={styles.paneFocus}>{focusToggle}</span>
            </div>
            <div ref={questionScrollRef} className={styles.scroller} data-reading-question-scroller="">
              <div ref={questionsRef} className={styles.questions} data-reading-questions="">
                {children}
              </div>
              {items.length ? (
                <div className={styles.stepper}>
                  <button type="button" className={styles.stepButton} aria-label="上一题" onClick={() => step(-1)} disabled={index === 0}>
                    <ArrowLeftIcon aria-hidden="true" />
                    <span>上一题</span>
                  </button>
                  <div className={styles.locators}>
                    {shownGraded && hasEvidence ? (
                      <button type="button" className={styles.locator} data-kind="evidence" onClick={locateEvidence}>
                        <CrosshairIcon aria-hidden="true" />
                        原文定位
                      </button>
                    ) : null}
                    {refs.map((number) => (
                      <button key={number} type="button" className={styles.locator} onClick={() => locateParagraph(number)} title={`在原文中查看第 ${number} 段`}>
                        <TextQuoteIcon aria-hidden="true" />
                        第 {number} 段
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.stepButton}
                    aria-label="下一题"
                    data-primary={shownGraded && !last ? '' : undefined}
                    onClick={() => step(1)}
                    disabled={last}
                  >
                    <span>下一题</span>
                    <ArrowRightIcon aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      {marks.menu}
    </>
  );
}
