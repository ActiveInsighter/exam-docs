'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { QUESTION_SELECTOR, readPageQuestions as readItems, samePageQuestions as sameItems, type PageQuestion, type PageQuestionStatus } from '@/components/question/page-questions';

/* The questions inside the reading card, read from the DOM (see page-questions). */

export type NavStatus = PageQuestionStatus;
export type NavItem = PageQuestion;

/** Line, in viewport pixels, below which a question counts as "current". */
function referenceLine(container: HTMLElement) {
  const scrollsInside = /(auto|scroll)/.test(getComputedStyle(container).overflowY);
  if (scrollsInside) return container.getBoundingClientRect().top + 96;
  const card = container.closest('[data-english-reading]');
  let bottom = 0;
  for (const sticky of card?.querySelectorAll('[data-reading-sticky]') ?? []) {
    const box = sticky.getBoundingClientRect();
    if (box.height > 0) bottom = Math.max(bottom, box.bottom);
  }
  return bottom + 64;
}

export function useQuestionNav(ref: RefObject<HTMLElement | null>) {
  const [items, setItems] = useState<NavItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // While a navigator jump scrolls smoothly, keep the picked question current.
  const pinnedUntil = useRef(0);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const read = () => setItems((previous) => {
      const next = readItems(container);
      return sameItems(previous, next) ? previous : next;
    });
    read();
    const observer = new MutationObserver(read);
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-attempt-result'],
    });

    let frame = 0;
    const track = () => {
      frame = 0;
      if (performance.now() < pinnedUntil.current) return;
      const questions = container.querySelectorAll<HTMLElement>(QUESTION_SELECTOR);
      if (questions.length === 0 || container.getClientRects().length === 0) return;
      const line = referenceLine(container);
      let current = questions[0];
      for (const question of questions) {
        if (question.getBoundingClientRect().top <= line) current = question;
        else break;
      }
      // At the very end of a pane the last question is current even if short.
      if (container.scrollHeight > container.clientHeight && container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
        current = questions[questions.length - 1];
      }
      setActive(current.id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(track);
    };
    track();
    // Capture catches the pane, the docs panel and the window alike.
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [ref]);

  const pin = useCallback((id: string) => {
    pinnedUntil.current = performance.now() + 800;
    setActive(id);
  }, []);

  return { items, active, pin };
}
