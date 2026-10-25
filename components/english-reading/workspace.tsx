'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  CrosshairIcon,
  EraserIcon,
  ListChecksIcon,
  Maximize2Icon,
  RotateCcwIcon,
  SendHorizontalIcon,
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
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { ModalPane, ModalSplit, ModalTag } from '@/components/ui/modal';
import { StudyCard, StudyCardHeader } from '@/components/ui/study-card';
import {
  PAGE_QUESTION_STATUS_TEXT,
  QUESTION_SELECTOR,
  REVEAL_QUESTION_EVENT,
  readPageQuestions,
  samePageQuestions,
  type PageQuestion,
} from '@/components/question/page-questions';
import { QuestionBatchProvider, type BatchMember, type QuestionBatch } from '@/components/question/question-batch';
import { PASSAGE_PARAGRAPHS, useHighlights } from './use-highlights';
import styles from './reading.module.css';

/*
 * The reading card, laid out like a computer-based reading test.
 *
 *   wide (card ≥ 48rem)   passage left, one question at a time right, each
 *                         pane scrolling on its own; a draggable divider
 *   narrow                原文 / 题目 switch in a bar that sticks under the
 *                         docs header; the page scrolls
 *   expanded              the same passage and questions in a study card
 *                         (components/ui/study-card.tsx): the passage on the
 *                         card's grey aside, the questions on its white main
 *                         pane, the card's pager stepping questions
 *
 * Passage tools: 译 (every paragraph's translation; a paragraph number
 * shows that paragraph's alone), text size, and a highlighter
 * (use-highlights). Question tools: the answer-sheet strip, 上一题 / 下一题,
 * links to the paragraphs a question names ("Paragraph 3"), and, once a
 * question is graded, 原文定位 to the <Evidence> it is answered from.
 *
 * Grading: 逐题判分 grades each question as it is answered (the shared
 * question behaviour); 整篇提交 holds every answer as a draft until 提交全部
 * grades them together (question-batch). The choice is kept per reader.
 *
 * Every question stays mounted (its state, the solution deck and the
 * floating dock read them from the page); the ones not shown are only out
 * of layout. Expanding moves them into the card and back (their answers
 * live in the question store, so they come back as they were). Navigators
 * ask for one with revealQuestion (page-questions).
 */

type View = 'article' | 'questions';
type Status = PageQuestion['status'];
type Direction = 'next' | 'prev';

const SPLIT_DEFAULT = 54;
const SPLIT_MIN = 34;
const SPLIT_MAX = 68;
const SPLIT_KEY = 'exam-reading-split';
const SIZE_KEY = 'exam-reading-size';
const MODE_KEY = 'exam-reading-mode';
const SIZES = ['小', '中', '大'] as const;

const clampSplit = (value: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(value * 10) / 10));
const clampMode = (value: number) => (value === 1 ? 1 : 0);
const graded = (status: Status | undefined) => status === 'correct' || status === 'partial' || status === 'incorrect';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

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

/** A setting kept across visits (pane split, text size, grading mode). */
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

/** The element that scrolls the content around a node (the docs page, or the expanded card on phones). */
function pageScroller(node: HTMLElement): HTMLElement {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) return element;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** True when the panes scroll on their own (side by side, inline or expanded). */
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

/*
 * Stepping between questions: the one left drifts out towards the side it is
 * left by and fades, while the next comes in from the other side, its header,
 * stem rows and footer rising one after another. Without a direction (a jump
 * from elsewhere) the question only rises into place.
 */
function switchQuestion(entering: HTMLElement, leaving: HTMLElement | null, direction: Direction | null) {
  if (reduceMotion() || typeof entering.animate !== 'function') return;
  const shift = direction === 'prev' ? -1 : 1;
  const crossing = !!(leaving && direction);
  if (leaving && crossing) {
    leaving.setAttribute('data-reading-leaving', '');
    leaving.inert = true;
    const out = leaving.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift * 1.5}rem)` }],
      { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    const done = () => {
      leaving.removeAttribute('data-reading-leaving');
      leaving.inert = false;
      out.cancel();
    };
    out.finished.then(done, done);
  }
  entering.animate(
    [{ opacity: 0, transform: crossing ? `translateX(${shift * 2.25}rem)` : 'translateY(0.375rem)' }, { opacity: 1, transform: 'none' }],
    { duration: crossing ? 460 : 320, delay: crossing ? 100 : 0, easing: EASE_OUT, fill: 'backwards' },
  );
  const rows = entering.querySelectorAll<HTMLElement>(':scope > [data-question-header], :scope > [data-exam-question-body] > *, :scope > [data-question-footer]');
  Array.from(rows).slice(0, 10).forEach((row, order) => {
    row.animate(
      [{ opacity: 0, transform: 'translateY(0.5rem)' }, { opacity: 1, transform: 'none' }],
      { duration: 440, delay: (crossing ? 140 : 30) + order * 38, easing: EASE_OUT, fill: 'backwards' },
    );
  });
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
function useQuestions(container: HTMLElement | null) {
  const [items, setItems] = useState<PageQuestion[]>([]);
  useEffect(() => {
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
  }, [container]);
  return items;
}

/** Paragraphs, words and an estimated reading time. */
function useArticleStats(scroller: HTMLElement | null) {
  const [stats, setStats] = useState<{ paragraphs: number; words: number } | null>(null);
  useEffect(() => {
    const passage = scroller?.querySelector<HTMLElement>('[data-reading-passage]');
    if (!passage) return;
    const english = passage.cloneNode(true) as HTMLElement;
    english.querySelectorAll('[data-reading-translation]').forEach((node) => node.remove());
    const words = (english.textContent ?? '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
    setStats({ paragraphs: passage.querySelectorAll(PASSAGE_PARAGRAPHS).length, words });
  }, [scroller]);
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
  const articleRef = useRef<HTMLDivElement | null>(null);
  const questionsRef = useRef<HTMLDivElement | null>(null);
  const questionScrollRef = useRef<HTMLDivElement | null>(null);

  // The passage and question elements move into the expanded card and back;
  // the hooks reading them follow the element in use.
  const [articleEl, setArticleEl] = useState<HTMLDivElement | null>(null);
  const [questionsEl, setQuestionsEl] = useState<HTMLDivElement | null>(null);
  const bindArticle = useCallback((node: HTMLDivElement | null) => {
    articleRef.current = node;
    setArticleEl(node);
  }, []);
  const bindQuestions = useCallback((node: HTMLDivElement | null) => {
    questionsRef.current = node;
    setQuestionsEl(node);
  }, []);
  const bindQuestionScroll = useCallback((node: HTMLDivElement | null) => {
    questionScrollRef.current = node;
  }, []);

  const [view, setView] = useState<View>('article');
  const [resizing, setResizing] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  /* Narrow layout, after 原文定位: the question to come back to. */
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [split, setSplit, commitSplit] = useStored(SPLIT_KEY, SPLIT_DEFAULT, clampSplit);
  const [size, , commitSize] = useStored(SIZE_KEY, 1, clampSize);
  const [mode, , commitMode] = useStored(MODE_KEY, 0, clampMode);
  const batchMode = mode === 1;
  const [confirming, setConfirming] = useState(false);

  /* Expanded: `expanded` drives the card; `inModal` holds the content there until it has closed. */
  const [expanded, setExpanded] = useState(false);
  const [inModal, setInModal] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState<number | null>(null);

  const items = useQuestions(questionsEl);
  const stats = useArticleStats(articleEl);
  const marks = useHighlights(articleEl, `exam-reading-marks:${storageKey}`);

  const index = Math.max(0, items.findIndex((item) => item.id === current));
  const item = items[index];
  const gradedCount = items.filter((entry) => graded(entry.status)).length;
  const started = items.filter((entry) => entry.status !== 'idle').length;
  const correct = items.filter((entry) => entry.status === 'correct').length;
  const drafts = items.filter((entry) => entry.status === 'draft').length;
  const unanswered = items.filter((entry) => entry.status === 'idle');

  // The question shown: the first until the reader picks another.
  const shownId = item?.id ?? null;

  /* ---- Grading together ---- */

  const members = useRef(new Map<string, BatchMember>());
  const batch = useMemo<QuestionBatch>(() => ({
    deferred: batchMode,
    register: (member) => {
      members.current.set(member.id, member);
      return () => {
        if (members.current.get(member.id) === member) members.current.delete(member.id);
      };
    },
  }), [batchMode]);

  useEffect(() => {
    if (!batchMode || drafts === 0) setConfirming(false);
  }, [batchMode, drafts]);

  /* ---- Showing one question ---- */

  /** Shows one question and hides the rest, in the DOM at once (no render needed). */
  const display = useCallback((id: string | null, direction: Direction | null = null) => {
    const container = questionsRef.current;
    if (!container || !id) return;
    const previous = container.querySelector<HTMLElement>(':scope > [data-reading-current]');
    let next: HTMLElement | null = null;
    for (const question of container.querySelectorAll<HTMLElement>(QUESTION_SELECTOR)) {
      const on = question.id === id;
      question.toggleAttribute('data-reading-current', on);
      if (on) next = question;
    }
    if (next && previous && previous !== next) switchQuestion(next, previous, direction);
  }, []);

  useLayoutEffect(() => {
    display(shownId);
    cardRef.current?.setAttribute('data-ready', '');
  }, [display, shownId, questionsEl]);

  const narrow = () => !scrollsInside(articleRef.current);

  /** Where content starts below what overlays it: the sticky bar, or the expanded card's header. */
  const topInset = () => {
    const root = inModal ? questionsRef.current?.closest('[data-english-reading-modal]') : cardRef.current;
    const bar = root?.querySelector<HTMLElement>(inModal ? '[data-slot="modal-header"]' : '[data-reading-bar]');
    return bar?.getBoundingClientRect().bottom ?? 0;
  };

  /** Moves to a question: shown, scrolled to its top, and in view. */
  const show = useCallback((id: string, { focusAnswer = false } = {}) => {
    const container = questionsRef.current;
    const target = container?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    const from = items.findIndex((entry) => entry.id === shownId);
    const to = items.findIndex((entry) => entry.id === id);
    display(id, from < 0 || to < 0 || from === to ? null : to > from ? 'next' : 'prev');
    setCurrent(id);
    setReturnTo(null);
    const card = cardRef.current;
    if (narrow()) {
      setView('questions');
      requestAnimationFrame(() => {
        const inset = topInset();
        const top = target.getBoundingClientRect().top;
        if (top < inset || top > window.innerHeight * 0.6) pageScroller(target).scrollBy({ top: top - inset - 64, behavior: 'auto' });
      });
    } else {
      questionScrollRef.current?.scrollTo({ top: 0 });
      if (card && !inModal) bringIntoView(card);
    }
    if (focusAnswer) {
      requestAnimationFrame(() => target
        .querySelector<HTMLElement>('[data-exam-choice-option]:not([aria-disabled="true"]), [data-boolean-option], input:not([disabled]), [data-self-grade] button')
        ?.focus({ preventScroll: true }));
    }
    // topInset and narrow read the DOM at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, items, shownId, inModal]);

  // Navigators elsewhere (the floating dock, the solution card, #links) ask
  // for a question through revealQuestion; take over and show it here.
  useEffect(() => {
    if (!questionsEl) return;
    const onReveal = (event: Event) => {
      const question = (event.target as Element).closest<HTMLElement>(QUESTION_SELECTOR);
      if (!question || !questionsEl.contains(question)) return;
      event.preventDefault();
      show(question.id);
    };
    questionsEl.addEventListener(REVEAL_QUESTION_EVENT, onReveal);
    return () => questionsEl.removeEventListener(REVEAL_QUESTION_EVENT, onReveal);
  }, [show, questionsEl]);

  // Only on load and on hash changes, not whenever `show` changes.
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && questionsRef.current?.querySelector(`[id="${CSS.escape(id)}"]`)) showRef.current(id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const step = (delta: number) => {
    const next = items[index + delta];
    if (next) show(next.id);
  };

  /* ---- Submit all, redo all ---- */

  const submitAll = () => {
    setConfirming(false);
    for (const member of members.current.values()) {
      if (!member.submitted() && member.answered()) member.submit();
    }
    if (items[0]) show(items[0].id);
  };

  const confirmRef = useRef<HTMLDivElement>(null);
  const requestSubmitAll = () => {
    if (unanswered.length === 0) return submitAll();
    setConfirming(true);
    requestAnimationFrame(() => confirmRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' }));
  };

  const resetAll = () => {
    setConfirming(false);
    // Questions never touched are left alone, so no empty answers are saved for them.
    for (const member of members.current.values()) {
      if (member.submitted() || member.answered()) member.reset();
    }
    if (items[0]) show(items[0].id);
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
  }, [shownId, shownGraded, articleEl, questionsEl]);

  /** Scrolls the passage to an element (evidence or a paragraph) and makes it glow. */
  const reveal = (target: HTMLElement | undefined) => {
    const scroller = articleRef.current;
    const card = cardRef.current;
    if (!target || !scroller) return;
    const behavior: ScrollBehavior = reduceMotion() ? 'auto' : 'smooth';
    if (narrow()) {
      if (shownId) setReturnTo(shownId);
      setView('article');
      requestAnimationFrame(() => {
        pageScroller(target).scrollBy({ top: target.getBoundingClientRect().top - topInset() - window.innerHeight * 0.2, behavior });
        flash(target);
      });
      return;
    }
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight * 0.28), behavior });
    if (card && !inModal) bringIntoView(card);
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
    if (!scroller) return;
    const visibleTop = scrollsInside(scroller)
      ? Math.max(scroller.getBoundingClientRect().top, inModal ? topInset() : 0)
      : topInset();
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
    const article = articleRef.current;
    if (!saved || !article || !saved.node.isConnected) return;
    const shift = saved.node.getBoundingClientRect().top - saved.top;
    if (Math.abs(shift) < 1) return;
    const scroller = scrollsInside(article) ? article : pageScroller(article);
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

  /* ---- Expanded card ---- */

  const expand = () => {
    setPlaceholderHeight(cardRef.current?.getBoundingClientRect().height ?? null);
    setInModal(true);
    setExpanded(true);
  };

  // The card's content returns to the page once the close animation is over;
  // the fallback covers a close that reports no animation.
  useEffect(() => {
    if (expanded || !inModal) return;
    const timer = window.setTimeout(() => setInModal(false), 900);
    return () => window.clearTimeout(timer);
  }, [expanded, inModal]);

  const returned = useRef(false);
  useEffect(() => {
    if (inModal) {
      returned.current = true;
      return;
    }
    if (!returned.current) return;
    returned.current = false;
    const card = cardRef.current;
    if (!card) return;
    card.querySelector<HTMLElement>('[data-reading-expand]:not([hidden])')?.focus({ preventScroll: true });
    requestAnimationFrame(() => bringIntoView(card));
  }, [inModal]);

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
  const progress = items.length ? `${started}/${items.length}` : null;
  const last = index >= items.length - 1;
  const forward = shownGraded || (batchMode && item?.status === 'draft');

  const passageTools = (modal = false) => (
    <>
      {translatable ? (
        <ToolButton label={translated ? '隐藏中文翻译' : '显示中文翻译'} pressed={translated} onClick={toggleTranslation} className={cn(styles.toolText, modal && styles.modalTool)}>
          <span aria-hidden="true" className={styles.glyph}>译</span>
        </ToolButton>
      ) : null}
      <span className={styles.sizeGroup} role="group" aria-label={`字号：${SIZES[size]}`}>
        <ToolButton label="减小字号" onClick={() => changeSize(-1)} disabled={size === 0} className={modal ? styles.modalTool : undefined}>
          <span aria-hidden="true" className={styles.glyphSmall}>A</span>
        </ToolButton>
        <ToolButton label="增大字号" onClick={() => changeSize(1)} disabled={size === SIZES.length - 1} className={modal ? styles.modalTool : undefined}>
          <span aria-hidden="true" className={styles.glyph}>A</span>
        </ToolButton>
      </span>
      {marks.count ? (
        <ToolButton label={`清除全部 ${marks.count} 处高亮`} onClick={marks.clear} className={modal ? styles.modalTool : undefined}>
          <EraserIcon aria-hidden="true" />
        </ToolButton>
      ) : null}
    </>
  );

  const expandToggle = (
    <ToolButton label="展开阅读卡" onClick={expand} data-reading-expand="">
      <Maximize2Icon aria-hidden="true" />
    </ToolButton>
  );

  const segments = (className: string) => (
    <div role="tablist" aria-label="切换原文与题目" className={className}>
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
  );

  const score = progress ? (
    <span className={styles.score} aria-live="polite">
      已答 {progress}
      {gradedCount ? <> · <span className={styles.scoreCorrect}>对 {correct}</span></> : null}
    </span>
  ) : null;

  const articleBody = (
    <>
      {article}
      {marks.enabled ? <p className={styles.hint}>选中文字可高亮，点按高亮处可清除。</p> : null}
    </>
  );

  // Rendered with the page, so the question does not move down once hydrated.
  const modeRow = (
    <div className={styles.modeRow}>
      <div role="radiogroup" aria-label="判分方式" className={styles.modeSwitch}>
        <button type="button" role="radio" aria-checked={!batchMode} onClick={() => commitMode(0)}>逐题判分</button>
        <button type="button" role="radio" aria-checked={batchMode} onClick={() => commitMode(1)}>整篇提交</button>
      </div>
      {batchMode ? (
        gradedCount > 0 ? (
          <button type="button" className={styles.modeAction} onClick={resetAll}>
            <RotateCcwIcon aria-hidden="true" />
            全部重做
          </button>
        ) : (
          <span className={styles.modeNote}>做完再统一判分</span>
        )
      ) : null}
    </div>
  );

  const stepper = items.length ? (
    <>
      {confirming ? (
        <div ref={confirmRef} role="alertdialog" aria-labelledby={`${baseId}-confirm`} className={styles.confirm}>
          <p id={`${baseId}-confirm`}>还有 {unanswered.length} 题未作答，未答的题不判分。</p>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.confirmButton} onClick={() => { setConfirming(false); if (unanswered[0]) show(unanswered[0].id, { focusAnswer: true }); }}>
              去作答
            </button>
            <button type="button" className={styles.confirmButton} data-primary="" onClick={submitAll}>
              仍然提交
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.stepper}>
        <button type="button" className={styles.stepButton} aria-label="上一题" onClick={() => step(-1)} disabled={index === 0}>
          <ArrowLeftIcon aria-hidden="true" />
          <span>上一题</span>
        </button>
        <div className={styles.locators}>
          {/* Until the first submission, and again whenever new answers wait. */}
          {batchMode && (drafts > 0 || gradedCount === 0) ? (
            <button
              type="button"
              className={styles.submitAll}
              data-ready={drafts > 0 ? '' : undefined}
              disabled={drafts === 0}
              onClick={requestSubmitAll}
            >
              <SendHorizontalIcon aria-hidden="true" />
              提交全部
              <span className={styles.submitCount}>{drafts}</span>
            </button>
          ) : null}
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
          data-primary={forward && !last ? '' : undefined}
          onClick={() => step(1)}
          disabled={last}
        >
          <span>下一题</span>
          <ArrowRightIcon aria-hidden="true" />
        </button>
      </div>
    </>
  ) : null;

  const questionList = (
    <div ref={bindQuestions} className={styles.questions} data-reading-questions="">
      {children}
    </div>
  );

  const returnPill = returnTo ? (
    <button type="button" className={styles.returnPill} onClick={backToQuestion}>
      <UndoDotIcon aria-hidden="true" />
      回到第 {items.find((entry) => entry.id === returnTo)?.label} 题
    </button>
  ) : null;

  const shared = {
    'data-view': view,
    'data-translation': translated ? '' : undefined,
    'data-size': size,
  };

  return (
    <QuestionBatchProvider value={batch}>
      <section
        ref={cardRef}
        className={styles.card}
        data-english-reading=""
        data-resizing={resizing ? '' : undefined}
        data-expanded={inModal ? '' : undefined}
        {...shared}
        tabIndex={-1}
        aria-label="英语阅读理解"
      >
        {inModal ? (
          <div className={styles.placeholder} style={placeholderHeight ? { minHeight: placeholderHeight - 12 } : undefined}>
            <Maximize2Icon aria-hidden="true" />
            <p>阅读卡已展开</p>
            <button type="button" className={styles.confirmButton} onClick={() => setExpanded(true)} disabled={expanded}>
              回到阅读卡
            </button>
          </div>
        ) : (
          <>
            {/* Narrow layouts: one pane at a time, switched from a sticky bar. */}
            <div className={styles.bar} data-reading-bar="">
              {segments(styles.segments)}
              <div className={styles.barTools} data-view-tools={view}>
                {view === 'article' ? passageTools() : null}
                {expandToggle}
              </div>
            </div>

            <div ref={panesRef} className={styles.panes} style={{ '--reading-split': `${split}%` } as CSSProperties}>
              <div className={styles.pane} data-pane="article">
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
                  <span className={styles.paneTools}>{passageTools()}</span>
                </div>
                <div className={styles.progress} aria-hidden="true"><span /></div>
                <div ref={bindArticle} id={articleId} className={styles.scroller} data-reading-article="" tabIndex={-1} onClick={onArticleClick}>
                  {articleBody}
                </div>
                {returnPill}
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

              <div className={styles.pane} data-pane="questions">
                <div className={styles.paneHead}>
                  <SheetStrip items={items} current={shownId} onPick={(id) => show(id, { focusAnswer: true })} />
                  {score}
                  <span className={styles.paneFocus}>{expandToggle}</span>
                </div>
                <div ref={bindQuestionScroll} id={questionsId} className={styles.scroller} data-reading-question-scroller="">
                  {modeRow}
                  {questionList}
                  {stepper}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {inModal ? (
        <StudyCard
          open={expanded}
          onOpenChange={setExpanded}
          onOpenChangeComplete={(open) => { if (!open) setInModal(false); }}
          count={items.length}
          index={index}
          onIndexChange={(next) => { const target = items[next]; if (target) show(target.id); }}
          itemKey="reading"
          labels={{ group: '切换题目', prev: '上一题', next: '下一题' }}
          size="xl"
          height="fixed"
          className={styles.modal}
          data-english-reading-modal=""
          data-ready=""
          {...shared}
          finalFocus={() => cardRef.current ?? true}
        >
          <StudyCardHeader
            title="阅读理解"
            tags={(
              <>
                {stats ? <ModalTag>{stats.paragraphs} 段 · {stats.words} 词</ModalTag> : null}
                {progress ? <ModalTag>已答 {progress}{gradedCount ? ` · 对 ${correct}` : ''}</ModalTag> : null}
              </>
            )}
            tagsProps={{ 'aria-label': '概况' }}
            actionsLabel="阅读工具"
            actions={passageTools(true)}
          >
            {segments(cn(styles.segments, styles.modalSegments))}
          </StudyCardHeader>
          <ModalSplit columns={`minmax(0, ${split}fr) minmax(0, ${100 - split}fr)`}>
            <ModalPane
              tone="muted"
              ref={bindArticle}
              id={articleId}
              className={styles.modalArticle}
              data-reading-article=""
              data-reading-region="article"
              tabIndex={-1}
              onClick={onArticleClick}
            >
              {articleBody}
              {returnPill}
            </ModalPane>
            <ModalPane
              ref={bindQuestionScroll}
              id={questionsId}
              className={styles.modalQuestions}
              data-reading-question-scroller=""
              data-reading-region="questions"
            >
              <div className={styles.modalHead}>
                <SheetStrip items={items} current={shownId} onPick={(id) => show(id, { focusAnswer: true })} />
              </div>
              {modeRow}
              {questionList}
              {stepper}
            </ModalPane>
          </ModalSplit>
        </StudyCard>
      ) : null}
      {marks.menu}
    </QuestionBatchProvider>
  );
}
