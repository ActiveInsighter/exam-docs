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
import {
  type AttemptResult,
  type BlankSpec,
  gradeBlanks,
  gradeChoice,
} from './grading';
import { useQuestionDatabase } from './database-context';
import { PENDING_SNAPSHOT, QuestionAnswerCache, emptyAnswer } from '@/lib/question-store/cache';
import type { AnswerState, QuestionIdentity } from '@/lib/question-store/types';

/*
 * Per-question client state. The choice grid, the blanks, the status bar and
 * the solution dialog all read the same attempt, so the dialog shows exactly
 * what the reader entered on the page.
 */

export type { AttemptResult } from './grading';

export type GradingSpec =
  | { kind: 'choice'; multiple: boolean; key: readonly string[]; keyText?: string }
  | { kind: 'blank'; blanks: readonly BlankSpec[] };

type QuestionState = {
  spec: GradingSpec;
  /** Option letters picked so far (choice questions). */
  selected: readonly string[];
  /** Typed text per blank (blank questions). */
  values: readonly string[];
  submitted: boolean;
  result: AttemptResult | null;
  /** Per-blank correctness after submitting. */
  blankResults: readonly boolean[];
  /** Increments per submission so feedback motion replays on retry. */
  attempt: number;
  canSubmit: boolean;
  ready: boolean;
  storageError: string | null;
  retryStorage: () => void;
  select: (letters: readonly string[]) => void;
  setValue: (index: number, value: string) => void;
  submit: () => void;
  reset: () => void;
};

const QuestionContext = createContext<QuestionState | null>(null);

export function useQuestionState() {
  return useContext(QuestionContext);
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
  const storage = useQuestionDatabase();
  const pathname = usePathname();
  const documentPath = (pathname ?? '/').replace(/\/+$/, '') || '/';
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

  const isChoice = spec.kind === 'choice';
  const multiple = isChoice && spec.multiple;
  const canSubmit = ready && (isChoice
    ? selected.length > 0
    : values.some((value) => value.trim() !== ''));

  const select = useCallback(
    (letters: readonly string[]) => {
      if (!ready || !isChoice || current.current.submitted) return;
      const finish = !multiple && letters.length > 0;
      update({ ...current.current, selected: [...letters], submitted: finish,
        attempt: current.current.attempt + (finish ? 1 : 0) }, finish);
    },
    [ready, isChoice, multiple, update],
  );

  const setValue = useCallback(
    (index: number, value: string) => {
      if (!ready || isChoice || current.current.submitted) return;
      const next = Array.from({ length: Math.max(index + 1, current.current.values.length) }, (_, position) => current.current.values[position] ?? '');
      next[index] = value;
      update({ ...current.current, values: next });
    },
    [ready, isChoice, update],
  );

  const submit = useCallback(() => {
    if (current.current.submitted || !canSubmit) return;
    update({ ...current.current, submitted: true, attempt: current.current.attempt + 1 }, true);
  }, [canSubmit, update]);

  const reset = useCallback(() => {
    if (!ready) return;
    update({ ...emptyAnswer(), attempt: current.current.attempt });
  }, [ready, update]);

  const value = useMemo<QuestionState>(() => {
    let result: AttemptResult | null = null;
    let blankResults: readonly boolean[] = [];
    if (submitted) {
      if (spec.kind === 'choice') {
        result = gradeChoice(selected, spec.key);
      } else {
        const graded = gradeBlanks(values, spec.blanks);
        result = graded.result;
        blankResults = graded.correct;
      }
    }
    return {
      spec,
      selected,
      values,
      submitted,
      result,
      blankResults,
      attempt,
      canSubmit,
      ready,
      storageError,
      retryStorage,
      select,
      setValue,
      submit,
      reset,
    };
  }, [attempt, canSubmit, ready, storageError, retryStorage, reset, select, selected, setValue, spec, submit, submitted, values]);

  return <QuestionContext.Provider value={value}>{children}</QuestionContext.Provider>;
}

/**
 * Inside the solution dialog the stem is read-only and always shows the key,
 * on top of whatever the reader already entered.
 */
const RevealContext = createContext(false);

export function QuestionReveal({ children }: { children: ReactNode }) {
  return <RevealContext.Provider value>{children}</RevealContext.Provider>;
}

export function useQuestionReveal() {
  return useContext(RevealContext);
}
