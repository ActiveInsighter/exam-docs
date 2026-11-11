'use client';

import { useSyncExternalStore } from 'react';
import { PENDING_QUERY, type QuestionQuery } from '@/lib/question-store/query';

const pending = () => PENDING_QUERY;
const idle = () => () => {};

/** Switching the query switches its snapshot in render, before effects run. */
export function useQuestionQuery<T>(query: QuestionQuery<T> | null, enabled = true) {
  const active = enabled ? query : null;
  return useSyncExternalStore(active?.subscribe ?? idle, active?.getSnapshot ?? pending, pending);
}
