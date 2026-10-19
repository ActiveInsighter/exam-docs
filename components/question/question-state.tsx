'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  type AttemptResult,
  type BlankSpec,
  gradeBlanks,
  gradeChoice,
} from './grading';

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
  select: (letters: readonly string[]) => void;
  setValue: (index: number, value: string) => void;
  submit: () => void;
  reset: () => void;
};

const QuestionContext = createContext<QuestionState | null>(null);

export function useQuestionState() {
  return useContext(QuestionContext);
}

const EMPTY: readonly string[] = [];

export function QuestionProvider({
  spec,
  children,
}: {
  spec: GradingSpec;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<readonly string[]>(EMPTY);
  const [values, setValues] = useState<readonly string[]>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const isChoice = spec.kind === 'choice';
  const multiple = isChoice && spec.multiple;
  const canSubmit = isChoice
    ? selected.length > 0
    : values.some((value) => value.trim() !== '');

  const finish = useCallback(() => {
    setSubmitted(true);
    setAttempt((value) => value + 1);
  }, []);

  const select = useCallback(
    (letters: readonly string[]) => {
      if (!isChoice || submitted) return;
      setSelected(letters);
      // A single-answer question is graded on the first click.
      if (!multiple && letters.length > 0) finish();
    },
    [finish, isChoice, multiple, submitted],
  );

  const setValue = useCallback(
    (index: number, value: string) => {
      if (isChoice || submitted) return;
      setValues((current) => {
        const next = [...current];
        next[index] = value;
        return next;
      });
    },
    [isChoice, submitted],
  );

  const submit = useCallback(() => {
    if (submitted || !canSubmit) return;
    finish();
  }, [canSubmit, finish, submitted]);

  const reset = useCallback(() => {
    setSelected(EMPTY);
    setValues(EMPTY);
    setSubmitted(false);
  }, []);

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
      select,
      setValue,
      submit,
      reset,
    };
  }, [attempt, canSubmit, reset, select, selected, setValue, spec, submit, submitted, values]);

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
