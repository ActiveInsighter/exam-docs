'use client';

import { createContext, useContext } from 'react';

/*
 * A group of questions graded together (the reading card's 整篇提交). In a
 * deferred batch, answering never grades a question on its own: a pick on a
 * single-answer question stays a draft and the per-question submit step is
 * hidden, until the batch submits every answered question at once. Each
 * question in the batch registers its controls with it.
 */

export type BatchMember = {
  id: string;
  answered: () => boolean;
  submitted: () => boolean;
  submit: () => void;
  reset: () => void;
};

export type QuestionBatch = {
  deferred: boolean;
  /** Adds a question; the returned function removes it. */
  register: (member: BatchMember) => () => void;
};

const QuestionBatchContext = createContext<QuestionBatch | null>(null);

export const QuestionBatchProvider = QuestionBatchContext.Provider;

export function useQuestionBatch() {
  return useContext(QuestionBatchContext);
}
