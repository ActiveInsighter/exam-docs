'use client';

import { FlagIcon, PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import {
  PAGE_QUESTION_STATUS_TEXT,
  readPageQuestions,
  revealQuestion,
  samePageQuestions,
  type PageQuestion,
  type PageQuestionStatus,
} from '@/components/question/page-questions';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Elapsed, formatDuration, useStopwatch } from './stopwatch';

/*
 * Floating question dock: a ball in the corner whose ring shows every
 * question on the page, coloured by its result. It opens an answer sheet
 * (jump to any question) and a stopwatch with marks. The questions are read
 * from the rendered cards (page-questions), so <Question> knows nothing of it.
 */

/** Follows the page's question cards and their results. */
function usePageQuestions() {
  const [items, setItems] = useState<readonly PageQuestion[]>([]);

  useEffect(() => {
    const root = document.getElementById('docs-body');
    if (!root) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setItems((previous) => {
        const next = readPageQuestions(root);
        return samePageQuestions(previous, next) ? previous : next;
      });
    };
    read();
    // Answering changes many nodes at once; read once per frame.
    const observer = new MutationObserver(() => {
      frame ||= requestAnimationFrame(read);
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-attempt-result'] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return items;
}

/** The question at the upper part of the viewport: the one being read. */
function questionInView(items: readonly PageQuestion[]) {
  const line = window.innerHeight * 0.35;
  let current: PageQuestion | null = null;
  for (const item of items) {
    const element = document.getElementById(item.id);
    // Questions kept out of layout (the reading card shows one at a time).
    if (!element || element.getClientRects().length === 0) continue;
    if (!current || element.getBoundingClientRect().top <= line) current = item;
    else break;
  }
  return current;
}

const isPinned = (element: Element) => /^(sticky|fixed)$/.test(getComputedStyle(element).position);

/** Bottom edge of the bars pinned to the top of the screen (the phone header and its TOC bar). */
function pinnedTop() {
  const x = window.innerWidth / 2;
  let bottom = 0;
  for (let guard = 0; guard < 4; guard += 1) {
    let bar: Element | null = null;
    for (let element = document.elementFromPoint(x, bottom + 1); element && element !== document.body; element = element.parentElement) {
      if (isPinned(element)) bar = element;
    }
    const box = bar?.getBoundingClientRect();
    if (!box || box.bottom <= bottom || box.height > window.innerHeight / 2) break;
    bottom = box.bottom;
  }
  return bottom;
}

/** Same cue as a #question link (exam-card-target in question.css). */
function flash(target: HTMLElement) {
  const ring = 'color-mix(in oklch, currentColor 22%, transparent)';
  target.animate(
    [
      { boxShadow: `0 0 0 2px ${ring}` },
      { boxShadow: `0 0 0 2px ${ring}`, offset: 0.3 },
      { boxShadow: '0 0 0 2px transparent' },
    ],
    { duration: 1600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

const INTERRUPTS = ['wheel', 'touchstart', 'keydown'] as const;

/**
 * Scrolls a question card to the top of the screen, below any pinned bars.
 * Cards off screen are laid out at an estimated height (content-visibility in
 * question.css), so a long scroll can land short or long once they render;
 * the scroll is re-aimed when it comes to rest, unless the reader takes over.
 */
function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target || revealQuestion(target)) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let goal = 0;
  const aim = () => {
    goal = pinnedTop() + 12;
    target.style.scrollMarginTop = `${goal}px`;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    target.style.removeProperty('scroll-margin-top');
  };

  let frame = 0;
  let retries = 2;
  let last = Number.NaN;
  let still = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of INTERRUPTS) window.removeEventListener(type, stop);
  };
  const settle = () => {
    const top = target.getBoundingClientRect().top;
    still = Math.abs(top - last) < 0.5 ? still + 1 : 0;
    last = top;
    if (still < 5) {
      frame = requestAnimationFrame(settle);
      return;
    }
    if (Math.abs(top - goal) > 2 && retries-- > 0) {
      still = 0;
      aim();
      frame = requestAnimationFrame(settle);
      return;
    }
    stop();
    if (!reduce) flash(target);
  };

  aim();
  for (const type of INTERRUPTS) window.addEventListener(type, stop, { passive: true });
  frame = requestAnimationFrame(settle);
}

const RING_RADIUS = 25;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** One arc per question, in page order, clockwise from the top. */
const DockRing = memo(function DockRing({ items }: { items: readonly PageQuestion[] }) {
  const step = RING_LENGTH / items.length;
  const gap = items.length > 1 ? Math.min(2.4, step * 0.35) : 0;
  return (
    <svg data-dock-ring="" viewBox="0 0 56 56" aria-hidden="true">
      <circle data-dock-track="" cx="28" cy="28" r={RING_RADIUS} />
      {items.map((item, index) => (
        <circle
          key={item.id}
          data-status={item.status}
          cx="28"
          cy="28"
          r={RING_RADIUS}
          strokeDasharray={`${step - gap} ${RING_LENGTH}`}
          strokeDashoffset={-index * step}
        />
      ))}
    </svg>
  );
});

const LEGEND: readonly { status: PageQuestionStatus; label: string }[] = [
  { status: 'correct', label: '正确' },
  { status: 'incorrect', label: '错误' },
  { status: 'partial', label: '部分' },
  { status: 'idle', label: '未答' },
];

export function QuestionDock() {
  const items = usePageQuestions();
  const watch = useStopwatch();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  if (items.length === 0) return null;

  const counts: Record<PageQuestionStatus, number> = { idle: 0, draft: 0, correct: 0, partial: 0, incorrect: 0 };
  for (const item of items) counts[item.status] += 1;
  const graded = counts.correct + counts.partial + counts.incorrect;
  const accuracy = graded ? Math.round((counts.correct / graded) * 100) : null;
  const marked = new Set(watch.marks.map((mark) => mark.questionId));

  const onOpenChange = (next: boolean) => {
    if (next) setCurrent(questionInView(items)?.id ?? null);
    setOpen(next);
  };
  const pick = (id: string) => {
    setOpen(false);
    jumpTo(id);
  };
  const markHere = () => {
    const question = questionInView(items);
    watch.mark({ questionId: question?.id ?? null, label: question?.label ?? null });
  };

  return (
    <div data-question-dock="">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          data-dock-ball=""
          data-running={watch.running ? '' : undefined}
          aria-label={`答题卡：已答 ${graded}/${items.length} 题${watch.running ? '，计时中' : ''}`}
        >
          <DockRing items={items} />
          <span data-dock-face="">
            {watch.started ? (
              <span data-dock-time=""><Elapsed clock={watch.clock} /></span>
            ) : (
              <span data-dock-count="">
                {graded}
                <small>/{items.length}</small>
              </span>
            )}
          </span>
        </PopoverTrigger>

        <PopoverContent side="top" align="end" sideOffset={12} className="w-80 p-0" data-dock-panel="">
          <section data-dock-timer="" aria-label="计时">
            <div className="min-w-0">
              <div data-dock-clock="" data-running={watch.running ? '' : undefined}>
                <Elapsed clock={watch.clock} />
              </div>
              <p className="text-xs text-muted-foreground">
                {watch.running ? '计时中' : watch.started ? '已暂停' : '点击开始计时'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="重置计时" title="重置" disabled={!watch.started} onClick={watch.reset}>
                <RotateCcwIcon />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="标记当前题目与时间" title="标记" disabled={!watch.started} onClick={markHere}>
                <FlagIcon />
              </Button>
              <Button size="icon-lg" className="size-10 rounded-full" aria-label={watch.running ? '暂停计时' : '开始计时'} onClick={watch.running ? watch.pause : watch.start}>
                {watch.running ? <PauseIcon className="fill-current" /> : <PlayIcon className="translate-x-px fill-current" />}
              </Button>
            </div>
          </section>

          {watch.marks.length ? (
            <ol data-dock-marks="" aria-label="标记">
              {watch.marks.map((mark, index) => (
                <li key={index}>
                  <button type="button" disabled={!mark.questionId} onClick={() => mark.questionId && pick(mark.questionId)}>
                    <FlagIcon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {mark.label ? `第 ${mark.label} 题` : `标记 ${index + 1}`}
                    </span>
                    <span data-dock-split="">+{formatDuration(mark.at - (watch.marks[index - 1]?.at ?? 0))}</span>
                    <span className="tabular-nums">{formatDuration(mark.at)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          <section data-dock-sheet="" aria-label="答题卡">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium">答题卡</h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                已答 {graded}/{items.length}
                {accuracy !== null ? <span className="ms-2">正确率 {accuracy}%</span> : null}
              </p>
            </div>
            <div data-dock-grid="">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-status={item.status}
                  data-marked={marked.has(item.id) ? '' : undefined}
                  aria-current={item.id === current ? 'true' : undefined}
                  aria-label={`第 ${item.label} 题，${PAGE_QUESTION_STATUS_TEXT[item.status]}`}
                  title={`第 ${item.label} 题 · ${PAGE_QUESTION_STATUS_TEXT[item.status]}`}
                  onClick={() => pick(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <ul data-dock-legend="">
              {LEGEND.map(({ status, label }) => (
                <li key={status} data-status={status}>
                  {label} <span className="tabular-nums">{status === 'idle' ? counts.idle + counts.draft : counts[status]}</span>
                </li>
              ))}
            </ul>
          </section>
        </PopoverContent>
      </Popover>
    </div>
  );
}
