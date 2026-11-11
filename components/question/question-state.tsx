'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { diag } from '@/lib/diagnostics';
import { PENDING_SNAPSHOT, QuestionAnswerCache } from '@/lib/question-store/cache';
import type { AnswerState, QuestionIdentity } from '@/lib/question-store/types';
import * as rules from './attempt';
import { useQuestionStorage } from './database-context';
import { type BlankGrade, evaluateAttempt, type Evaluation, type GradingSpec } from './grading';

/*
 * Per-question client state: the stored answer of one question, its grade,
 * and the moves a reader can make (attempt.ts holds their rules). The
 * options, blanks, footer and solution sheet all read the same attempt, so
 * the sheet shows exactly what the reader entered on the page.
 */

export type QuestionActions = {
  /** Replaces the picked letters; single answers and self-grades are graded at once. */
  select: (letters: readonly string[]) => void;
  setValue: (index: number, value: string) => void;
  submit: () => void;
  reset: () => void;
  /** A submitted blank: the reader's own grade, or null for the checker's. Not another attempt. */
  gradeBlank: (index: number, grade: BlankGrade | null) => void;
  /** Blanks before submitting (对答案自评): grading the last one submits. */
  selfGradeBlanks: (grades: ReadonlyMap<number, BlankGrade>) => void;
  retryStorage: () => void;
};

export type QuestionState = QuestionActions & {
  spec: GradingSpec;
  /** Option letters picked so far; for blanks, the reader's grades (grading.ts). */
  selected: readonly string[];
  /** Typed text per blank. */
  values: readonly string[];
  submitted: boolean;
  /** Grade of the submitted answer; null while answering. */
  evaluation: Evaluation | null;
  status: rules.AttemptStatus;
  /** Increments per submission so feedback motion replays on retry. */
  attempt: number;
  /** The shown grade was submitted in this visit (restored grades do not animate). */
  fresh: boolean;
  /** The stored answer has been read; until then the question is locked. */
  ready: boolean;
  storageError: string | null;
};

const QuestionContext = createContext<QuestionState | null>(null);

export function useQuestionState() {
  return useContext(QuestionContext);
}

/** Provides a state read elsewhere on the page: the solution sheet showing another question. */
export const QuestionStateScope = QuestionContext.Provider;

/** The page path questions are stored under (no trailing slash). */
export function useDocumentPath() {
  const pathname = usePathname();
  return (pathname ?? '/').replace(/\/+$/, '') || '/';
}

/** Questions rendered outside the site provider (tests, previews) keep answers in memory only. */
let memoryCache: QuestionAnswerCache | undefined;

/** Warns before leaving while an answer could not be saved. */
function useUnsavedGuard(cache: QuestionAnswerCache | null, active: boolean) {
  useEffect(() => {
    if (!active || !cache) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!cache.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [cache, active]);
}

export function QuestionProvider({ spec, questionId, questionRevision = 'unversioned', children }: {
  spec: GradingSpec;
  questionId: string;
  questionRevision?: string;
  children: ReactNode;
}) {
  const storage = useQuestionStorage();
  const documentPath = useDocumentPath();
  // Inside the site provider a null cache means "still opening": the question waits.
  const cache = storage ? storage.cache : (memoryCache ??= new QuestionAnswerCache(null, 'guest'));

  // Reads come from the shared memory cache: one IndexedDB read per page, no per-question round trip.
  const store = useMemo(() => {
    const identity: QuestionIdentity = { documentPath, questionId, questionRevision };
    return {
      subscribe: (listener: () => void) => cache?.subscribe(identity, listener) ?? (() => {}),
      read: () => cache?.read(identity) ?? PENDING_SNAPSHOT,
      write: (state: AnswerState, kind: NonNullable<rules.Transition>['kind']) => cache?.write(identity, state, kind),
      retry: () => { cache?.retry(identity); },
    };
  }, [cache, documentPath, questionId, questionRevision]);
  const snapshot = useSyncExternalStore(store.subscribe, store.read, () => PENDING_SNAPSHOT);
  const { ready, error: storageError, state } = snapshot;
  useUnsavedGuard(cache, storageError !== null);

  // The ref sees a write before React re-renders, so rapid input never builds on a stale answer.
  const current = useRef(state);
  current.current = state;
  // The attempt count first read from storage; later submissions are "fresh".
  const baseline = useRef<number | null>(null);
  if (ready && baseline.current === null) baseline.current = state.attempt;
  const fresh = state.submitted && baseline.current !== null && state.attempt > baseline.current;

  const actions = useMemo<QuestionActions>(() => {
    // Drafts stay on this device; a submission, regrade or reset is committed and reaches the cloud.
    const apply = (move: (state: AnswerState) => rules.Transition) => {
      const next = ready ? move(current.current) : null;
      if (!next) return;
      if (next.kind !== 'draft') diag('answer', { kind: next.kind, question: questionId });
      current.current = next.state;
      store.write(next.state, next.kind);
    };
    return {
      select: (letters) => apply((answer) => rules.pick(spec, answer, letters)),
      setValue: (index, value) => apply((answer) => rules.fill(spec, answer, index, value)),
      submit: () => apply((answer) => rules.submit(spec, answer)),
      reset: () => apply(rules.reset),
      gradeBlank: (index, grade) => apply((answer) => rules.regradeBlank(spec, answer, index, grade)),
      selfGradeBlanks: (grades) => apply((answer) => rules.selfGradeBlanks(spec, answer, grades)),
      retryStorage: store.retry,
    };
  }, [store, spec, ready, questionId]);

  // Grading parses maths answers, so it runs once per submitted state, not per render.
  const evaluation = useMemo(
    () => (state.submitted ? evaluateAttempt(spec, state.selected, state.values) : null),
    [spec, state],
  );

  const value = useMemo<QuestionState>(() => ({
    ...actions,
    spec,
    selected: state.selected,
    values: state.values,
    submitted: state.submitted,
    attempt: state.attempt,
    evaluation,
    status: rules.attemptStatus(spec, state, evaluation),
    fresh,
    ready,
    storageError,
  }), [actions, spec, state, evaluation, fresh, ready, storageError]);

  return <QuestionContext.Provider value={value}>{children}</QuestionContext.Provider>;
}
