'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/*
 * Per-question client state. The choice grid, the status bar and the solution
 * dialog all read the same attempt, so the dialog shows exactly what the
 * reader picked on the page.
 */

export type AttemptResult = 'correct' | 'partial' | 'incorrect';

type ExamQuestionState = {
  /** Validated option letters, or null when the question is not gradable. */
  answerKey: readonly string[] | null;
  multiple: boolean;
  selected: readonly string[];
  submitted: boolean;
  result: AttemptResult | null;
  /** Increments per submission so feedback motion replays on retry. */
  attempt: number;
  select: (letters: readonly string[]) => void;
  submit: () => void;
  reset: () => void;
};

const ExamQuestionContext = createContext<ExamQuestionState | null>(null);

export function useExamQuestion() {
  return useContext(ExamQuestionContext);
}

function evaluate(selected: readonly string[], key: readonly string[]): AttemptResult {
  const chosen = new Set(selected);
  const hits = key.filter((letter) => chosen.has(letter)).length;
  if (hits === key.length && chosen.size === key.length) return 'correct';
  if (hits === chosen.size && hits > 0) return 'partial';
  return 'incorrect';
}

export function ExamQuestionProvider({
  answerKey,
  children,
}: {
  answerKey: readonly string[] | null;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const multiple = (answerKey?.length ?? 0) > 1;

  const select = useCallback(
    (letters: readonly string[]) => {
      if (!answerKey || submitted) return;
      setSelected(letters);
      // A single-answer question is graded on the first click.
      if (!multiple && letters.length > 0) {
        setSubmitted(true);
        setAttempt((value) => value + 1);
      }
    },
    [answerKey, multiple, submitted],
  );

  const submit = useCallback(() => {
    if (!answerKey || submitted || selected.length === 0) return;
    setSubmitted(true);
    setAttempt((value) => value + 1);
  }, [answerKey, selected.length, submitted]);

  const reset = useCallback(() => {
    setSelected([]);
    setSubmitted(false);
  }, []);

  const value = useMemo<ExamQuestionState>(
    () => ({
      answerKey,
      multiple,
      selected,
      submitted,
      result: submitted && answerKey ? evaluate(selected, answerKey) : null,
      attempt,
      select,
      submit,
      reset,
    }),
    [answerKey, attempt, multiple, reset, select, selected, submit, submitted],
  );

  return (
    <ExamQuestionContext.Provider value={value}>{children}</ExamQuestionContext.Provider>
  );
}

/**
 * Inside the solution dialog the grid is read-only and always shows the key,
 * on top of whatever the reader already selected.
 */
const ChoiceRevealContext = createContext(false);

export function ChoiceReveal({ children }: { children: ReactNode }) {
  return <ChoiceRevealContext.Provider value>{children}</ChoiceRevealContext.Provider>;
}

export function useChoiceReveal() {
  return useContext(ChoiceRevealContext);
}
