'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { usePathname } from 'next/navigation';
import { PENDING_SNAPSHOT, QuestionAnswerCache, emptyAnswer } from '@/lib/question-store/cache';
import type { AnswerState, QuestionIdentity } from '@/lib/question-store/types';
import { useQuestionStorage } from './database-context';
import { evaluateAttempt, isAnswered, type Evaluation, type GradingSpec } from './grading';

/*
 * Per-question client state. The options, blanks, footer and solution sheet
 * all read the same attempt, so the sheet shows exactly what the reader
 * entered on the page.
 */

export type { AttemptResult, GradingSpec } from './grading';

export type QuestionState = {
  spec: GradingSpec;
  identity: QuestionIdentity;
  /** Option letters picked so far (choice and boolean questions). */
  selected: readonly string[];
  /** Typed text per blank (blank questions). */
  values: readonly string[];
  submitted: boolean;
  /** Grade of the submitted answer; null while answering. */
  evaluation: Evaluation | null;
  /** Increments per submission so feedback motion replays on retry. */
  attempt: number;
  /** The shown grade was submitted in this visit (restored grades do not animate). */
  fresh: boolean;
  answered: boolean;
  canSubmit: boolean;
  ready: boolean;
  storageError: string | null;
  retryStorage: () => void;
  /** Replaces the selection; single-answer questions are graded at once. */
  select: (letters: readonly string[]) => void;
  setValue: (index: number, value: string) => void;
  submit: () => void;
  reset: () => void;
};

const QuestionContext = createContext<QuestionState | null>(null);

export function useQuestionState() {
  return useContext(QuestionContext);
}

/** Provides a state read elsewhere on the page: the solution sheet showing another question. */
export function QuestionStateScope({ value, children }: { value: QuestionState | null; children: ReactNode }) {
  return <QuestionContext.Provider value={value}>{children}</QuestionContext.Provider>;
}

/** The page path questions are stored under (no trailing slash). */
export function useDocumentPath() {
  const pathname = usePathname();
  return (pathname ?? '/').replace(/\/+$/, '') || '/';
}

/** Questions rendered outside the site provider (tests, previews) keep answers in memory only. */
let memoryCache: QuestionAnswerCache | undefined;

export function QuestionProvider({
  spec,
  questionId,
  questionRevision = 'unversioned',
  children,
}: {
  spec: GradingSpec;
  questionId: string;
  questionRevision?: string;
  children: ReactNode;
}) {
  const storage = useQuestionStorage();
  const documentPath = useDocumentPath();
  const cache = storage ? storage.cache : (memoryCache ??= new QuestionAnswerCache(null, 'guest'));
  const identity = useMemo<QuestionIdentity>(() => ({ documentPath, questionId, questionRevision }), [documentPath, questionId, questionRevision]);
  // Reads come from the shared memory cache: one IndexedDB read per page, no per-question round trip.
  const subscribe = useCallback((listener: () => void) => cache?.subscribe(identity, listener) ?? (() => {}), [cache, identity]);
  const snapshot = useSyncExternalStore(subscribe, () => cache?.read(identity) ?? PENDING_SNAPSHOT, () => PENDING_SNAPSHOT);
  const { ready, error: storageError } = snapshot;
  // The ref sees a write before React re-renders, so rapid input never builds on a stale answer.
  const current = useRef(snapshot.state);
  current.current = snapshot.state;
  const { selected, values, submitted, attempt } = snapshot.state;
  // The attempt count first read from storage; later submissions are "fresh".
  const baseline = useRef<number | null>(null);
  if (ready && baseline.current === null) baseline.current = attempt;
  const fresh = submitted && baseline.current !== null && attempt > baseline.current;

  const update = useCallback((next: AnswerState, submission = false) => {
    current.current = next;
    cache?.write(identity, next, { submission });
  }, [cache, identity]);

  const retryStorage = useCallback(() => { cache?.retry(identity); }, [cache, identity]);

  useEffect(() => {
    if (!storageError || !cache) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!cache.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [storageError, cache]);

  const kind = spec.kind;
  const instant = kind === 'boolean' || (kind === 'choice' && !spec.multiple);
  const answered = isAnswered(spec, selected, values);
  const canSubmit = ready && !submitted && answered;

  const select = useCallback(
    (letters: readonly string[]) => {
      if (!ready || kind === 'blank' || current.current.submitted) return;
      const finish = instant && letters.length > 0;
      update({ ...current.current, selected: [...letters], submitted: finish,
        attempt: current.current.attempt + (finish ? 1 : 0) }, finish);
    },
    [ready, kind, instant, update],
  );

  const setValue = useCallback(
    (index: number, value: string) => {
      if (!ready || kind !== 'blank' || current.current.submitted) return;
      const next = Array.from({ length: Math.max(index + 1, current.current.values.length) }, (_, position) => current.current.values[position] ?? '');
      next[index] = value;
      update({ ...current.current, values: next });
    },
    [ready, kind, update],
  );

  const submit = useCallback(() => {
    const state = current.current;
    if (!ready || state.submitted || !isAnswered(spec, state.selected, state.values)) return;
    update({ ...state, submitted: true, attempt: state.attempt + 1 }, true);
  }, [ready, spec, update]);

  const reset = useCallback(() => {
    if (!ready) return;
    update({ ...emptyAnswer(), attempt: current.current.attempt });
  }, [ready, update]);

  // Grading parses maths answers, so it runs once per submitted state, not per render.
  const evaluation = useMemo(
    () => (submitted ? evaluateAttempt(spec, selected, values) : null),
    [submitted, spec, selected, values],
  );

  const value = useMemo<QuestionState>(() => ({
    spec,
    identity,
    selected,
    values,
    submitted,
    evaluation,
    attempt,
    fresh,
    answered,
    canSubmit,
    ready,
    storageError,
    retryStorage,
    select,
    setValue,
    submit,
    reset,
  }), [spec, identity, selected, values, submitted, evaluation, attempt, fresh, answered, canSubmit, ready, storageError, retryStorage, select, setValue, submit, reset]);

  return <QuestionContext.Provider value={value}>{children}</QuestionContext.Provider>;
}
