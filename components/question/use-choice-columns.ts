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
 */

const OPTION_SELECTOR = '[data-exam-choice-option]';
const WIDTH_CHANGE_EPSILON_PX = 0.5;
export const MEASURED_COLUMNS_VAR = '--choice-cols-measured';

const tracked = new Set<HTMLElement>();
const pending = new Set<HTMLElement>();
const knownWidths = new WeakMap<HTMLElement, number>();
let flushQueued = false;
let resizeObserver: ResizeObserver | null = null;
let fontsListening = false;

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

function getResizeObserver() {
  if (resizeObserver || typeof ResizeObserver === 'undefined') return resizeObserver;

  resizeObserver = new ResizeObserver((entries) => {
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
  return resizeObserver;
}

function listenForFonts() {
  if (fontsListening || !('fonts' in document)) return;
  fontsListening = true;
  document.fonts.addEventListener('loadingdone', () => {
    for (const group of tracked) schedule(group);
  });
}

export function useChoiceColumns(ref: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const group = ref.current;
    if (!enabled || !group) return;

    tracked.add(group);
    getResizeObserver()?.observe(group);
    listenForFonts();
    schedule(group);

    return () => {
      tracked.delete(group);
      pending.delete(group);
      resizeObserver?.unobserve(group);
    };
  }, [ref, enabled]);
}
