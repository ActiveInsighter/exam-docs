'use client';

import { useSyncExternalStore } from 'react';
import type { SolutionEntry } from './solution-deck';

type Presentation = { entry: SolutionEntry | null; phase: 'prepared' | 'open' | 'closing' };
const empty: Presentation = { entry: null, phase: 'prepared' };
let presentation = empty;
const listeners = new Set<() => void>();

function publish(next: Presentation) {
  presentation = next;
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Only one hidden card is ever prepared, independently of page length. */
export function prepareSolution(entry: SolutionEntry) {
  if (presentation.phase !== 'prepared' || presentation.entry?.key === entry.key) return;
  publish({ entry, phase: 'prepared' });
}

export function openSolution(entry: SolutionEntry) {
  publish({ entry, phase: 'open' });
}

export function closeSolution() {
  if (presentation.phase === 'open') publish({ ...presentation, phase: 'closing' });
}

export function finishSolutionClose() {
  if (presentation.phase === 'closing') publish({ ...presentation, phase: 'prepared' });
}

export function resetSolutionPresentation() { publish(empty); }

export function useSolutionPresentation() {
  return useSyncExternalStore(subscribe, () => presentation, () => empty);
}

/** Opening a card only rerenders its own trigger, rather than every question. */
export function useSolutionOpen(key: string) {
  return useSyncExternalStore(subscribe, () => presentation.phase === 'open' && presentation.entry?.key === key, () => false);
}

let cancelPreparation: (() => void) | null = null;

/** A nearby question warms the single host while the browser is idle, including on touch. */
export function prepareFirstSolution(entry: SolutionEntry) {
  if (presentation.entry || cancelPreparation) return;
  const prepare = () => {
    cancelPreparation = null;
    if (!presentation.entry && entry.trigger.current?.isConnected) prepareSolution(entry);
  };
  const cancel = 'requestIdleCallback' in window
    ? (() => { const id = window.requestIdleCallback(prepare); return () => window.cancelIdleCallback(id); })()
    : (() => { const id = setTimeout(prepare, 100); return () => clearTimeout(id); })();
  cancelPreparation = cancel;
  return () => {
    cancel();
    if (cancelPreparation === cancel) cancelPreparation = null;
  };
}
