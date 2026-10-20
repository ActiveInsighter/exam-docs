'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  type AttemptResult,
  type BlankSpec,
  gradeBlanks,
  gradeChoice,
} from './grading';
import { useQuestionDatabase } from './database-provider';
import { questionKey, type AnswerState, type QuestionIdentity } from '@/lib/question-store/types';

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
  select: (letters: readonly string[]) => void;
  setValue: (index: number, value: string) => void;
  submit: () => void;
  reset: () => void;
};

const QuestionContext = createContext<QuestionState | null>(null);

export function useQuestionState() {
  return useContext(QuestionContext);
}

const emptyAnswer = (): AnswerState => ({ selected: [], values: [], submitted: false, attempt: 0 });

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
  const [answerState, setAnswerState] = useState<AnswerState>(emptyAnswer);
  const current = useRef(answerState);
  const binding = useRef<{
    identity: QuestionIdentity;
    pending: number;
    read: number;
    write: number;
    failed: boolean;
    disposed: boolean;
    reload: () => Promise<void>;
  } | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const bindingKey = JSON.stringify([storage?.namespace ?? 'memory', documentPath, questionId, questionRevision]);
  const ready = !storage || (storage.ready && (!storage.database || hydratedKey === bindingKey));
  const { selected, values, submitted, attempt } = ready ? answerState : emptyAnswer();

  useEffect(() => {
    if (!storage?.ready || !storage.database) return;
    const { database, namespace } = storage;
    const target: QuestionIdentity = {
      documentPath,
      questionId,
      questionRevision,
    };
    const active = { identity: target, pending: 0, read: 0, write: 0, failed: false, disposed: false, reload: async () => {} };
    binding.current = active;
    setStorageError(null);
    const load = async () => {
      if (active.pending > 0 || active.failed) return; // Keep an unsaved answer visible after a storage failure.
      const version = ++active.read;
      try {
        const record = await database.get(namespace, target);
        if (active.disposed || version !== active.read || active.pending > 0) return;
        const next = record?.state ?? emptyAnswer();
        current.current = next;
        setAnswerState(next);
        setHydratedKey(bindingKey);
        setStorageError(null);
      } catch {
        if (!active.disposed) {
          setStorageError('答案读取失败，请刷新页面后重试。');
        }
      }
    };
    active.reload = load;
    void load();
    const unsubscribe = database.subscribe((change) => {
      if (change.namespace === namespace && (!change.key || change.key === questionKey(target))) void load();
    });
    return () => {
      active.disposed = true; unsubscribe();
      if (binding.current === active) binding.current = null;
    };
  }, [storage?.database, storage?.namespace, storage?.ready, documentPath, questionId, questionRevision, bindingKey]);

  const update = useCallback((next: AnswerState, submission = false) => {
    current.current = next;
    setAnswerState(next);
    const active = binding.current;
    if (!storage?.database || !active || active.disposed) return;
    const database = storage.database;
    const target = active.identity;
    const namespace = storage.namespace;
    active.pending += 1;
    const write = ++active.write;
    active.read += 1; // Invalidate reads that began before this keystroke.
    void database.save(namespace, target, next, { submission }).then(() => {
      if (!active.disposed && write === active.write) { active.failed = false; setStorageError(null); }
    }).catch(() => {
      if (!active.disposed && write === active.write) {
        active.failed = true;
        setStorageError('答案未能保存到本机，请先复制当前答案并检查浏览器存储空间。');
      }
    }).finally(() => {
      active.pending -= 1;
      if (!active.disposed && active.pending === 0 && !active.failed) void active.reload();
    });
  }, [storage?.database, storage?.namespace]);

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
      select,
      setValue,
      submit,
      reset,
    };
  }, [attempt, canSubmit, ready, storageError, reset, select, selected, setValue, spec, submit, submitted, values]);

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
