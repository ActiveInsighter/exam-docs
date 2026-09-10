'use client';

import { useLayoutEffect } from 'react';
import { getChoiceColumnCount } from './exam-choice-layout';

const GROUP_SELECTOR = '[data-exam-choice-group]';
const OPTION_SELECTOR = '[data-exam-choice-option]';
const WIDTH_CHANGE_EPSILON_PX = 0.5;

type ChoiceMeasurement = {
  group: HTMLElement;
  containerWidth: number;
  optionWidths: number[];
  columnGap: number;
};

function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function measureOptionWidth(option: HTMLElement): number {
  let width = Math.max(option.getBoundingClientRect().width, option.scrollWidth);

  // Display math can own its horizontal scroller, so its overflow does not
  // always propagate to the option's scrollWidth. Read that surface directly.
  for (const displayMath of option.querySelectorAll<HTMLElement>('.katex-display')) {
    width = Math.max(
      width,
      displayMath.getBoundingClientRect().width,
      displayMath.scrollWidth,
    );
  }

  return width;
}

function measureChoiceGroups(groups: readonly HTMLElement[]) {
  const connectedGroups = groups.filter((group) => group.isConnected);
  const measuredWidths = new Map<HTMLElement, number>();

  if (connectedGroups.length === 0) return measuredWidths;

  // Batch the write before any layout reads. max-content + nowrap exposes each
  // option's rendered intrinsic width without trying 4, then 2, then 1 columns.
  for (const group of connectedGroups) {
    group.dataset.choiceMeasuring = 'true';
  }

  const measurements: ChoiceMeasurement[] = [];

  try {
    // All reads stay together so the browser can satisfy them from one layout.
    for (const group of connectedGroups) {
      const containerWidth = group.getBoundingClientRect().width;
      const options = Array.from(
        group.querySelectorAll<HTMLElement>(OPTION_SELECTOR),
      );
      const optionWidths = options.map(measureOptionWidth);
      const columnGap = parsePixelValue(getComputedStyle(group).columnGap);

      measurements.push({
        group,
        containerWidth,
        optionWidths,
        columnGap,
      });
      measuredWidths.set(group, containerWidth);
    }

    // Apply every result only after the complete read phase.
    for (const measurement of measurements) {
      const { group, containerWidth, optionWidths, columnGap } = measurement;

      if (containerWidth <= 0 || optionWidths.length === 0) {
        delete group.dataset.choiceLayout;
        continue;
      }

      group.dataset.choiceLayout = String(
        getChoiceColumnCount({ containerWidth, optionWidths, columnGap }),
      );
    }
  } finally {
    for (const group of connectedGroups) {
      delete group.dataset.choiceMeasuring;
    }
  }

  return measuredWidths;
}

function collectChoiceGroups(node: Node): HTMLElement[] {
  if (!(node instanceof Element)) return [];

  const groups: HTMLElement[] = [];
  if (node.matches(GROUP_SELECTOR)) groups.push(node as HTMLElement);
  groups.push(...node.querySelectorAll<HTMLElement>(GROUP_SELECTOR));
  return groups;
}

export function ExamChoiceLayoutEnhancer() {
  useLayoutEffect(() => {
    let frame = 0;
    let cancelled = false;
    const trackedGroups = new Set<HTMLElement>();
    const pendingGroups = new Set<HTMLElement>();
    const widthCache = new WeakMap<HTMLElement, number>();

    const flushPending = () => {
      frame = 0;
      const groups = Array.from(pendingGroups).filter(
        (group) => trackedGroups.has(group) && group.isConnected,
      );
      pendingGroups.clear();

      const widths = measureChoiceGroups(groups);
      for (const [group, width] of widths) {
        widthCache.set(group, width);
      }
    };

    const scheduleMeasure = (group: HTMLElement) => {
      if (!trackedGroups.has(group) || !group.isConnected) return;
      pendingGroups.add(group);
      if (frame === 0) frame = requestAnimationFrame(flushPending);
    };

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            for (const entry of entries) {
              const group = entry.target as HTMLElement;
              const width = entry.contentRect.width;
              const previousWidth = widthCache.get(group);
              widthCache.set(group, width);

              // The first notification just establishes the baseline. Later
              // notifications remeasure only when inline size actually changed.
              if (
                previousWidth !== undefined &&
                Math.abs(width - previousWidth) > WIDTH_CHANGE_EPSILON_PX
              ) {
                scheduleMeasure(group);
              }
            }
          });

    const registerGroup = (group: HTMLElement, shouldMeasure: boolean) => {
      if (trackedGroups.has(group)) return;
      trackedGroups.add(group);
      resizeObserver?.observe(group);
      if (shouldMeasure) scheduleMeasure(group);
    };

    const unregisterGroup = (group: HTMLElement) => {
      if (!trackedGroups.delete(group)) return;
      pendingGroups.delete(group);
      resizeObserver?.unobserve(group);
    };

    const initialGroups = Array.from(
      document.querySelectorAll<HTMLElement>(GROUP_SELECTOR),
    );
    for (const group of initialGroups) {
      trackedGroups.add(group);
    }

    const initialWidths = measureChoiceGroups(initialGroups);
    for (const group of initialGroups) {
      const width = initialWidths.get(group);
      if (width !== undefined) widthCache.set(group, width);
      resizeObserver?.observe(group);
    }

    const mutationObserver = new MutationObserver((records) => {
      const removed = new Set<HTMLElement>();
      const added = new Set<HTMLElement>();

      for (const record of records) {
        for (const node of record.removedNodes) {
          for (const group of collectChoiceGroups(node)) removed.add(group);
        }
        for (const node of record.addedNodes) {
          for (const group of collectChoiceGroups(node)) added.add(group);
        }
      }

      // Process removals first so a DOM move can immediately register again.
      for (const group of removed) unregisterGroup(group);
      for (const group of added) registerGroup(group, true);
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    if ('fonts' in document && document.fonts.status === 'loading') {
      void document.fonts.ready.then(() => {
        if (cancelled) return;
        for (const group of trackedGroups) scheduleMeasure(group);
      });
    }

    return () => {
      cancelled = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      trackedGroups.clear();
      pendingGroups.clear();
    };
  }, []);

  return null;
}
