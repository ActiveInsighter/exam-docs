'use client';

import { useEffect, useState } from 'react';
import { collectActivity, collectRecords, type QuestionRecord } from '@/lib/question-records';
import { useQuestionDatabase } from './database-context';

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
  const [state, setState] = useState<QuestionRecordsState>(LOADING);

  useEffect(() => {
    if (!enabled || !ready) return;
    if (!database) {
      setState({ records: [], activity: new Map(), error: context?.error ?? '本机答题记录不可用。' });
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      void Promise.all([database.answers.list(namespace), database.answers.listAttempts(namespace)])
        .then(([answers, attempts]) => {
          if (!disposed) setState({ records: collectRecords(answers, attempts), activity: collectActivity(answers, attempts), error: null });
        })
        .catch(() => {
          if (!disposed) setState((current) => ({ records: current.records ?? [], activity: current.activity ?? new Map(), error: '读取本机答题记录失败。' }));
        });
    };
    load();
    // A sync page can touch hundreds of rows in quick succession: reload once it settles.
    const unsubscribe = database.subscribe((change) => {
      if (change.namespace !== namespace || change.scope !== 'answers') return;
      clearTimeout(timer);
      timer = setTimeout(load, 120);
    });
    return () => { disposed = true; clearTimeout(timer); unsubscribe(); };
  }, [enabled, ready, database, namespace, context?.error]);

  return state;
}
