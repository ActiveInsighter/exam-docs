'use client';

import { useMemo } from 'react';
import { collectActivity, collectRecords, type QuestionRecord } from '@/lib/question-records';
import { createQuestionQuery } from '@/lib/question-store/query';
import { useQuestionDatabase } from './database-context';
import { useQuestionQuery } from './use-question-query';

export interface QuestionRecordsState {
  /** Null while the browser database is read. */
  records: QuestionRecord[] | null;
  /** Distinct questions worked on per local day (`YYYY-MM-DD`); null while reading. */
  activity: Map<string, number> | null;
  error: string | null;
}

const LOADING: QuestionRecordsState = { records: null, activity: null, error: null };

/**
 * Every question the current reader answered or submitted, newest first,
 * kept current while answers change on this or another tab and while sync
 * brings answers from other devices.
 */
export function useQuestionRecords(enabled = true): QuestionRecordsState {
  const context = useQuestionDatabase();
  const database = context?.database ?? null;
  const namespace = context?.namespace ?? 'guest';
  const ready = context?.ready ?? false;
  const query = useMemo(() => database ? createQuestionQuery({
    load: async () => {
      const [answers, attempts] = await Promise.all([database.answers.list(namespace), database.answers.listAttempts(namespace)]);
      return { records: collectRecords(answers, attempts), activity: collectActivity(answers, attempts) };
    },
    subscribe: (changed) => database.subscribe((change) => {
      if (change.namespace === namespace && change.scope === 'answers') changed();
    }),
    errorMessage: '读取本机答题记录失败。',
    delay: 120,
  }) : null, [database, namespace]);
  const { data, error } = useQuestionQuery(query, enabled && ready);

  if (!enabled || !ready) return LOADING;
  if (!database) return { records: [], activity: new Map(), error: context?.error ?? '本机答题记录不可用。' };
  if (data) return { ...data, error };
  return error ? { records: [], activity: new Map(), error } : LOADING;
}
