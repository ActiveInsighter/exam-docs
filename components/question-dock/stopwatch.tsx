'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';

/*
 * A stopwatch kept in memory only: leaving the page resets it. Time is read
 * from performance.now() rather than counted in ticks, so throttled timers
 * in a background tab never lose time.
 */

export type StopwatchMark = {
  /** Elapsed time when the mark was taken, in ms. */
  at: number;
  /** The question on screen when the mark was taken, if any. */
  questionId: string | null;
  label: string | null;
};

type Clock = { since: number | null; banked: number };
type State = Clock & { marks: readonly StopwatchMark[] };

const IDLE: State = { since: null, banked: 0, marks: [] };

const elapsed = ({ since, banked }: Clock, now: number) => banked + (since === null ? 0 : now - since);

export function useStopwatch() {
  const [state, setState] = useState<State>(IDLE);

  const start = useCallback(() => {
    const now = performance.now();
    setState((current) => (current.since === null ? { ...current, since: now } : current));
  }, []);

  const pause = useCallback(() => {
    const now = performance.now();
    setState((current) => (current.since === null ? current : { ...current, since: null, banked: elapsed(current, now) }));
  }, []);

  const mark = useCallback((target: Omit<StopwatchMark, 'at'>) => {
    const now = performance.now();
    setState((current) => ({ ...current, marks: [...current.marks, { ...target, at: elapsed(current, now) }] }));
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return {
    clock: { since: state.since, banked: state.banked },
    marks: state.marks,
    running: state.since !== null,
    started: state.since !== null || state.banked > 0,
    start,
    pause,
    mark,
    reset,
  };
}

/** 05:07, or 1:05:07 past the hour. */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * The running time as text. Only this leaf re-renders each second, and only
 * while the clock runs; ticks land on whole seconds.
 */
export function Elapsed({ clock }: { clock: Clock }) {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const { since, banked } = clock;

  useEffect(() => {
    if (since === null) return;
    let timer = 0;
    const schedule = () => {
      const remainder = (banked + performance.now() - since) % 1000;
      timer = window.setTimeout(() => {
        tick();
        schedule();
      }, 1000 - remainder + 4);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [since, banked]);

  return <>{formatDuration(elapsed(clock, performance.now()))}</>;
}
