'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  CrosshairIcon,
  EraserIcon,
  ListChecksIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  TextQuoteIcon,
  UndoDotIcon,
} from 'lucide-react';
import {
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
 * The reading exercise, in two places.
 *
 *   page    the passage alone, on paper, under a quiet caption (length,
 *           progress); 开始答题 floats at the bottom right beside the
 *           question dock while the passage is in view. The questions are
 *           rendered with it but kept out of sight
 *   card    a study card (components/ui/study-card.tsx) laid out like a
 *           computer-based reading test: the passage on the grey aside,
 *           one question at a time on the white main pane, the answer-sheet
 *           strip and the grading switch on one row above it, 上一题 /
 *           下一题 pinned to the pane's bottom; phones show one pane at a time
 *
 * Passage tools (in the card's header): 译 (every paragraph's translation;
 * a paragraph number shows that paragraph's alone, on the page too), text
 * size, and a highlighter (use-highlights). Question tools: the answer-sheet
 * strip, links to the paragraphs a question names ("Paragraph 3"), and,
 * once a question is graded, 原文定位 to the <Evidence> it is answered from.
 *
 * Grading: 逐题判分 grades each question as it is answered (the shared
 * question behaviour); 整篇提交 holds every answer as a draft until 提交全部
 * grades them together (question-batch). The choice is kept per reader.
 *
 * Every question stays mounted (its state, the solution deck and the
 * floating dock read them from the page): hidden on the page, moved into the
 * card while it is open and back once it has closed (answers live in the
 * question store, so they come back as they were). Navigators ask for one
 * with revealQuestion (page-questions), which opens the card on it.
 */

type View = 'article' | 'questions';
type Status = PageQuestion['status'];
type Direction = 'next' | 'prev';

const SPLIT = 'minmax(0, 54fr) minmax(0, 46fr)';
const SIZE_KEY = 'exam-reading-size';
const MODE_KEY = 'exam-reading-mode';
const SIZES = ['小', '中', '大'] as const;

const clampMode = (value: number) => (value === 1 ? 1 : 0);
const clampSize = (value: number) => Math.min(SIZES.length - 1, Math.max(0, Math.round(value)));
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

/** A setting kept across visits (text size, grading mode). */
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
  return [value, commit] as const;
}

/** The element that scrolls the content around a node (a card pane, or the whole card on phones). */
function pageScroller(node: HTMLElement): HTMLElement {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) return element;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** True when the panes scroll on their own (side by side). */
function scrollsInside(element: HTMLElement | null) {
  return !!element && /(auto|scroll)/.test(getComputedStyle(element).overflowY);
}

/** A brief glow on what a locate jumped to. */
function flash(element: HTMLElement) {
  element.removeAttribute('data-flash');
  // Restart the animation on repeated jumps.
  void element.offsetWidth;
  element.setAttribute('data-flash', '');
  element.addEventListener('animationend', () => element.removeAttribute('data-flash'), { once: true });
}

/** Ends a question's switch at once: no motion left, nothing overlaid. */
function settle(question: Element) {
  for (const animation of question.getAnimations()) animation.cancel();
  if (question instanceof HTMLElement && question.hasAttribute('data-reading-leaving')) {
    question.removeAttribute('data-reading-leaving');
    question.style.removeProperty('top');
    question.inert = false;
  }
}

/*
 * Stepping between questions moves the card as one piece, like turning a
 * page sideways: the one left slides a little towards the side it is left by
 * and fades quickly, held where it was on screen (`offset`: how far the pane
 * had scrolled) while the pane returns to the top; the next then slides in
 * from the other side as it fades in. Without a direction (a jump from elsewhere)
 * the question only fades up into place. A new step settles any switch still
 * running first, so quick steps never stack questions.
 */
function switchQuestion(entering: HTMLElement, leaving: HTMLElement | null, direction: Direction | null, offset = 0) {
  entering.parentElement?.querySelectorAll(':scope > [data-reading-leaving]').forEach(settle);
  settle(entering);
  if (leaving) settle(leaving);
  if (reduceMotion() || typeof entering.animate !== 'function') return;
  const shift = direction === 'prev' ? -1 : 1;
  if (leaving && direction) {
    leaving.setAttribute('data-reading-leaving', '');
    if (offset) leaving.style.top = `${-offset}px`;
    leaving.inert = true;
    const out = leaving.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift * 1.25}rem)` }],
      { duration: 140, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    out.finished.then(() => settle(leaving), () => {});
    // In as the other is all but gone, so the two never read as one.
    entering.animate(
      [{ opacity: 0, transform: `translateX(${shift * 1.75}rem)` }, { opacity: 1, transform: 'none' }],
      { duration: 340, delay: 110, easing: EASE_OUT, fill: 'backwards' },
    );
    return;
  }
  entering.animate(
    [{ opacity: 0, transform: 'translateY(0.375rem)' }, { opacity: 1, transform: 'none' }],
    { duration: 280, easing: EASE_OUT, fill: 'backwards' },
  );
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

/** The questions and their results, read from the rendered cards. */
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

/** Paragraphs and words of the passage. */
function useArticleStats(article: HTMLElement | null) {
  const [stats, setStats] = useState<{ paragraphs: number; words: number } | null>(null);
  useEffect(() => {
    const passage = article?.querySelector<HTMLElement>('[data-reading-passage]');
    if (!passage) return;
    const english = passage.cloneNode(true) as HTMLElement;
    english.querySelectorAll('[data-reading-translation]').forEach((node) => node.remove());
    const words = (english.textContent ?? '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
    setStats({ paragraphs: passage.querySelectorAll(PASSAGE_PARAGRAPHS).length, words });
  }, [article]);
  return stats;
}

/** Whether some of an element is on screen (true until it is known). */
function useInView(element: HTMLElement | null) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!element || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return inView;
}

function ToolButton({ label, pressed, disabled, onClick, children, className }: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
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
    >
      {children}
    </button>
  );
}

/**
 * The answer sheet: one button per question in its result colour, and a ring
 * that glides to the question shown.
 */
function SheetStrip({ items, current, onPick }: { items: PageQuestion[]; current: string | null; onPick: (id: string) => void }) {
  const stripRef = useRef<HTMLElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const status = items.find((item) => item.id === current)?.status;

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const ring = ringRef.current;
    const button = strip?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!strip || !ring || !button) return;
    ring.style.width = `${button.offsetWidth}px`;
    ring.style.transform = `translateX(${button.offsetLeft}px)`;
    // Placed without motion the first time, glides after.
    if (!ring.hasAttribute('data-placed')) requestAnimationFrame(() => ring.setAttribute('data-placed', ''));
    const left = button.offsetLeft - strip.scrollLeft;
    if (left < 0 || left + button.offsetWidth > strip.clientWidth) {
      strip.scrollTo({ left: button.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  }, [current, items.length]);

  if (items.length === 0) return null;
  return (
    <nav ref={stripRef} aria-label="题目导航" className={styles.sheet}>
      <span ref={ringRef} aria-hidden="true" className={styles.sheetRing} data-status={status} />
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
  questionCount,
  children,
}: {
  article: ReactNode;
  /** The article carries <Translation>s, so the 译 switch is offered. */
  translatable?: boolean;
  /** Names this article for the reader's highlights. */
  storageKey: string;
  /** How many questions follow the article, known before the page hydrates. */
  questionCount: number;
  children: ReactNode;
}) {
  const baseId = useId();
  const startRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLDivElement | null>(null);
  const questionsRef = useRef<HTMLDivElement | null>(null);
  const questionScrollRef = useRef<HTMLDivElement | null>(null);

  // The questions move into the card and back; the hooks reading them follow
  // the element in use. The passage is on the page and, while open, in the card.
  const [pageArticleEl, setPageArticleEl] = useState<HTMLDivElement | null>(null);
  const [cardArticleEl, setCardArticleEl] = useState<HTMLDivElement | null>(null);
  const [questionsEl, setQuestionsEl] = useState<HTMLDivElement | null>(null);
  const bindCardArticle = useCallback((node: HTMLDivElement | null) => {
    articleRef.current = node;
    setCardArticleEl(node);
  }, []);
  const bindQuestions = useCallback((node: HTMLDivElement | null) => {
    questionsRef.current = node;
    setQuestionsEl(node);
  }, []);
  const bindQuestionScroll = useCallback((node: HTMLDivElement | null) => {
    questionScrollRef.current = node;
  }, []);

  const [view, setView] = useState<View>('questions');
  const [translated, setTranslated] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  /* Phones, after 原文定位: the question to come back to. */
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [size, commitSize] = useStored(SIZE_KEY, 1, clampSize);
  const [mode, commitMode] = useStored(MODE_KEY, 0, clampMode);
  const batchMode = mode === 1;
  const [confirming, setConfirming] = useState(false);

  /* `open` drives the card; `inCard` holds the questions there until it has closed. */
  const [open, setOpen] = useState(false);
  const [inCard, setInCard] = useState(false);

  const items = useQuestions(questionsEl);
  const stats = useArticleStats(pageArticleEl);
  const passageInView = useInView(pageArticleEl);
  const marks = useHighlights(inCard ? cardArticleEl : pageArticleEl, `exam-reading-marks:${storageKey}`);

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

  /* ---- Opening the card ---- */

  /** Opens the card on a question (the one last shown by default), its questions pane in front on phones. */
  const start = useCallback((id?: string) => {
    if (id) setCurrent(id);
    setReturnTo(null);
    setView('questions');
    setInCard(true);
    setOpen(true);
  }, []);

  // The questions return to the page once the close animation is over;
  // the fallback covers a close that reports no animation.
  useEffect(() => {
    if (open || !inCard) return;
    const timer = window.setTimeout(() => setInCard(false), 900);
    return () => window.clearTimeout(timer);
  }, [open, inCard]);

  /* ---- Showing one question ---- */

  /** Shows one question and hides the rest, in the DOM at once (no render needed). */
  const display = useCallback((id: string | null, direction: Direction | null = null, offset = 0) => {
    const container = questionsRef.current;
    if (!container || !id) return;
    const previous = container.querySelector<HTMLElement>(':scope > [data-reading-current]');
    let next: HTMLElement | null = null;
    for (const question of container.querySelectorAll<HTMLElement>(QUESTION_SELECTOR)) {
      const on = question.id === id;
      question.toggleAttribute('data-reading-current', on);
      if (on) next = question;
    }
    if (next && previous && previous !== next) switchQuestion(next, previous, direction, offset);
  }, []);

  useLayoutEffect(() => {
    display(shownId);
  }, [display, shownId, questionsEl]);

  const narrow = () => !scrollsInside(articleRef.current);

  /** Where content starts below the card's header. */
  const topInset = () =>
    questionsRef.current?.closest('[data-english-reading-modal]')
      ?.querySelector<HTMLElement>('[data-slot="modal-header"]')
      ?.getBoundingClientRect().bottom ?? 0;

  /** Moves to a question in the open card: shown, scrolled to its top. */
  const show = useCallback((id: string, { focusAnswer = false } = {}) => {
    const target = questionsRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    const from = items.findIndex((entry) => entry.id === shownId);
    const to = items.findIndex((entry) => entry.id === id);
    const pane = questionScrollRef.current;
    const wide = !narrow();
    display(id, from < 0 || to < 0 || from === to ? null : to > from ? 'next' : 'prev', wide ? pane?.scrollTop ?? 0 : 0);
    setCurrent(id);
    setReturnTo(null);
    if (!wide) {
      setView('questions');
      requestAnimationFrame(() => {
        const inset = topInset();
        const top = target.getBoundingClientRect().top;
        if (top < inset || top > window.innerHeight * 0.6) pageScroller(target).scrollBy({ top: top - inset - 64, behavior: 'auto' });
      });
    } else {
      pane?.scrollTo({ top: 0 });
    }
    if (focusAnswer) {
      requestAnimationFrame(() => target
        .querySelector<HTMLElement>('[data-exam-choice-option]:not([aria-disabled="true"]), [data-boolean-option], input:not([disabled]), [data-self-grade] button')
        ?.focus({ preventScroll: true }));
    }
    // topInset and narrow read the DOM at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, items, shownId]);

  // Navigators elsewhere (the floating dock, the solution card, #links) ask
  // for a question through revealQuestion: show it in the card, opening it.
  useEffect(() => {
    if (!questionsEl) return;
    const onReveal = (event: Event) => {
      const question = (event.target as Element).closest<HTMLElement>(QUESTION_SELECTOR);
      if (!question || !questionsEl.contains(question)) return;
      event.preventDefault();
      if (inCard && open) show(question.id);
      else start(question.id);
    };
    questionsEl.addEventListener(REVEAL_QUESTION_EVENT, onReveal);
    return () => questionsEl.removeEventListener(REVEAL_QUESTION_EVENT, onReveal);
  }, [show, start, questionsEl, inCard, open]);

  // Only on load and on hash changes: a link to a question opens the card on it.
  const startLatest = useRef(start);
  startLatest.current = start;
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && questionsRef.current?.querySelector(`[id="${CSS.escape(id)}"]`)) startLatest.current(id);
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

  // The shown question's evidence is marked in the card's passage once it is graded.
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
  }, [shownId, shownGraded, cardArticleEl, questionsEl]);

  /** Scrolls the passage to an element (evidence or a paragraph) and makes it glow. */
  const reveal = (target: HTMLElement | undefined) => {
    const scroller = articleRef.current;
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

  /* ---- Translation and text size ---- */

  /*
   * Showing or hiding translations reflows the passage. Keep the paragraph at
   * the top of the visible article where it was (native scroll anchoring is
   * off on the passage for this).
   */
  const anchor = useRef<{ node: HTMLElement; top: number } | null>(null);
  const keepPlace = () => {
    const scroller = articleRef.current;
    if (!scroller) return;
    const visibleTop = Math.max(scrollsInside(scroller) ? scroller.getBoundingClientRect().top : 0, topInset());
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
    const opened = !paragraph.hasAttribute('data-open');
    paragraph.toggleAttribute('data-open', opened);
    toggle.setAttribute('aria-expanded', String(opened));
  };

  /* ---- Render ---- */

  const articleId = `${baseId}-article`;
  const questionsId = `${baseId}-questions`;
  const total = items.length || questionCount;
  const progress = total ? `${started}/${total}` : null;
  const last = index >= items.length - 1;
  const forward = shownGraded || (batchMode && item?.status === 'draft');
  const done = total > 0 && gradedCount === total;

  const passageTools = (
    <>
      {translatable ? (
        <ToolButton label={translated ? '隐藏中文翻译' : '显示中文翻译'} pressed={translated} onClick={toggleTranslation}>
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

  const segments = (
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
  );

  const articleBody = (
    <>
      {article}
      {marks.enabled ? <p className={styles.hint}>选中文字可高亮，点按高亮处可清除。</p> : null}
    </>
  );

  // The answer sheet and the grading switch share one row above the question.
  const questionHead = (
    <div className={styles.questionHead}>
      <SheetStrip items={items} current={shownId} onPick={(id) => show(id, { focusAnswer: true })} />
      <div className={styles.modeGroup}>
        {batchMode && gradedCount > 0 ? (
          <button type="button" className={styles.modeAction} onClick={resetAll} title="清空答案，重新作答">
            <RotateCcwIcon aria-hidden="true" />
            全部重做
          </button>
        ) : null}
        <div role="radiogroup" aria-label="判分方式" className={styles.modeSwitch}>
          <button type="button" role="radio" aria-checked={!batchMode} title="每题作答后立即判分" onClick={() => commitMode(0)}>逐题判分</button>
          <button type="button" role="radio" aria-checked={batchMode} title="做完再统一判分" onClick={() => commitMode(1)}>整篇提交</button>
        </div>
      </div>
    </div>
  );

  // Pinned to the bottom of the question pane, so it holds still whatever the question's length.
  const stepper = items.length ? (
    <div className={styles.footer}>
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
    </div>
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

  const facts = [
    stats ? `${stats.paragraphs} 段 · ${stats.words} 词` : null,
    total ? `${total} 题` : null,
  ].filter(Boolean).join(' · ');

  return (
    <QuestionBatchProvider value={batch}>
      <section className={styles.card} data-english-reading="" data-size={size} aria-label="英语阅读理解">
        {/* Floats at the bottom right, beside the question dock, while the passage is in view. */}
        <button
          ref={startRef}
          type="button"
          className={styles.start}
          onClick={() => start()}
          data-reading-start=""
          data-away={passageInView && !open ? undefined : ''}
        >
          {done ? '查看作答' : started ? '继续答题' : '开始答题'}
          {started && !done ? <span className={styles.startCount}>{progress}</span> : null}
          <ArrowRightIcon aria-hidden="true" />
        </button>

        <div className={styles.frame}>
          <p className={styles.caption} data-reading-bar="">
            <span className={styles.captionTitle}>阅读理解</span>
            {facts ? <span className={styles.captionFacts}>{facts}</span> : null}
            {started ? (
              <span className={styles.captionScore} aria-live="polite">
                已答 {progress}
                {gradedCount ? <> · <span className={styles.scoreCorrect}>对 {correct}</span></> : null}
              </span>
            ) : null}
          </p>

          <div ref={setPageArticleEl} className={styles.paper} data-reading-article="" onClick={onArticleClick}>
            {articleBody}
          </div>
        </div>

        {/* Out of sight on the page (printed, though); in the card while it is open. */}
        {inCard ? null : <div className={styles.parked}>{questionList}</div>}
      </section>

      {inCard ? (
        <StudyCard
          open={open}
          onOpenChange={setOpen}
          onOpenChangeComplete={(isOpen) => { if (!isOpen) setInCard(false); }}
          count={items.length}
          index={index}
          onIndexChange={(next) => { const target = items[next]; if (target) show(target.id); }}
          itemKey="reading"
          labels={{ group: '切换题目', prev: '上一题', next: '下一题' }}
          size="xl"
          height="fixed"
          className={styles.modal}
          data-english-reading-modal=""
          data-view={view}
          data-translation={translated ? '' : undefined}
          data-size={size}
          finalFocus={() => startRef.current ?? true}
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
            actions={passageTools}
            // The answer sheet and 上一题 / 下一题 already step (as do ← / →).
            pager={false}
          >
            {segments}
          </StudyCardHeader>
          <ModalSplit columns={SPLIT}>
            <ModalPane
              tone="muted"
              ref={bindCardArticle}
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
              className={styles.questionPane}
              data-reading-question-scroller=""
              data-reading-region="questions"
            >
              {questionHead}
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
