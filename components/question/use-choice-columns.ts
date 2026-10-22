'use client';

import { type RefObject, useLayoutEffect } from 'react';
import { getChoiceColumnCount } from './choice-layout';

/*
 * Shared, batched measurement for every choice group on the page.
 *
 * Groups register from their own layout effect; all registrations of one
 * commit are flushed together in a microtask (still before paint), so a page
 * with dozens of questions costs a single forced layout instead of one each.
 * Results are written straight to a CSS variable, never to React state.
 *
 * Question cards use `content-visibility: auto`, so the browser skips layout
 * of cards far off screen. Measuring them up front would force that layout
 * for the whole page; instead a group is first measured when it comes near
 * the viewport. Until then the container-query density hint lays it out.
 */

const OPTION_SELECTOR = '[data-exam-choice-option]';
const WIDTH_CHANGE_EPSILON_PX = 0.5;
export const MEASURED_COLUMNS_VAR = '--choice-cols-measured';

const tracked = new Set<HTMLElement>();
const pending = new Set<HTMLElement>();
const knownWidths = new WeakMap<HTMLElement, number>();
let flushQueued = false;

function measureOptionWidth(option: HTMLElement) {
  // Layout widths ignore transforms, so dialogs measure correctly mid-animation.
  let width = Math.max(option.offsetWidth, option.scrollWidth);

  // Display math owns its own scroller; its overflow does not always reach
  // the option's scrollWidth.
  for (const math of option.querySelectorAll<HTMLElement>('.katex-display')) {
    width = Math.max(width, math.scrollWidth);
  }
  return width;
}

function flush() {
  flushQueued = false;
  const groups = Array.from(pending).filter(
    (group) => tracked.has(group) && group.isConnected,
  );
  pending.clear();
  if (groups.length === 0) return;

  // Write phase: max-content + nowrap exposes each option's intrinsic width.
  for (const group of groups) group.dataset.measuring = '';

  try {
    // Read phase: every read is satisfied by the same layout.
    const results = groups.map((group) => {
      const containerWidth = group.clientWidth;
      const optionWidths = Array.from(
        group.querySelectorAll<HTMLElement>(OPTION_SELECTOR),
        measureOptionWidth,
      );
      const columnGap = Number.parseFloat(getComputedStyle(group).columnGap) || 0;
      knownWidths.set(group, containerWidth);
      return { group, containerWidth, optionWidths, columnGap };
    });

    // Apply phase.
    for (const { group, ...input } of results) {
      if (input.containerWidth <= 0 || input.optionWidths.length === 0) {
        group.style.removeProperty(MEASURED_COLUMNS_VAR);
        continue;
      }
      group.style.setProperty(
        MEASURED_COLUMNS_VAR,
        String(getChoiceColumnCount(input)),
      );
    }
  } finally {
    for (const group of groups) delete group.dataset.measuring;
  }
}

function schedule(group: HTMLElement) {
  pending.add(group);
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(flush);
}

/*
 * The observers and the font listener live as long as the page, so they are
 * created when this module is evaluated, not from the effect. A callback
 * created inside the effect (the minifier inlines single-use helpers into it)
 * shares the effect's scope and keeps the first group, and through it a whole
 * previous page, alive after client-side navigation.
 */
const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
  for (const entry of entries) {
    const group = entry.target as HTMLElement;
    const width = entry.contentRect.width;
    const previous = knownWidths.get(group);
    // Only a real inline-size change can alter the column decision.
    if (previous === undefined || Math.abs(width - previous) > WIDTH_CHANGE_EPSILON_PX) {
      schedule(group);
    }
  }
});

/** Measures each group once it is within a screen of the viewport; resizes are handled by the ResizeObserver. */
const nearObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const group = entry.target as HTMLElement;
    nearObserver?.unobserve(group);
    if (!tracked.has(group)) continue;
    resizeObserver?.observe(group);
    schedule(group);
  }
}, { rootMargin: '100% 0px' });

if (typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts.addEventListener('loadingdone', () => {
    for (const group of tracked) if (knownWidths.has(group)) schedule(group);
  });
}

const registering = new Set<HTMLElement>();
let registerQueued = false;

/**
 * Groups already near the viewport are measured in the same pre-paint
 * microtask (no visible column jump); the rest wait for the observer.
 */
function register(group: HTMLElement) {
  registering.add(group);
  if (registerQueued) return;
  registerQueued = true;
  queueMicrotask(flushRegistrations);
}

function flushRegistrations() {
  registerQueued = false;
  const groups = Array.from(registering).filter((entry) => tracked.has(entry) && entry.isConnected);
  registering.clear();
  const limit = window.innerHeight * 2;
  const tops = groups.map((entry) => entry.getBoundingClientRect().top);
  groups.forEach((entry, index) => {
    if (!nearObserver || (tops[index] > -limit && tops[index] < limit)) {
      resizeObserver?.observe(entry);
      schedule(entry);
    } else {
      nearObserver.observe(entry);
    }
  });
}

export function useChoiceColumns(ref: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const group = ref.current;
    if (!enabled || !group) return;

    tracked.add(group);
    register(group);

    return () => {
      tracked.delete(group);
      pending.delete(group);
      nearObserver?.unobserve(group);
      resizeObserver?.unobserve(group);
    };
  }, [ref, enabled]);
}
