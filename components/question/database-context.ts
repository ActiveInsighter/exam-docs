'use client';

import { createContext, useContext } from 'react';
import type { AccountIdentity } from '@/lib/account/types';
import type { QuestionAnswerCache, QuestionDatabase, QuestionSyncEngine } from '@/lib/question-store';
import type { QuestionNamespace, QuestionSyncStatus } from '@/lib/question-store/types';

export type QuestionDatabaseContext = {
  database: QuestionDatabase | null;
  /** Memory cache every question reads from; null until the browser database has been opened (or failed). */
  cache: QuestionAnswerCache | null;
  namespace: QuestionNamespace;
  user: AccountIdentity | null;
  cachedAccount: AccountIdentity | null;
  engine: QuestionSyncEngine | null;
  status: QuestionSyncStatus;
  ready: boolean;
  error: string | null;
  openConflicts(): void;
};

export const LOCAL_STATUS: QuestionSyncStatus = { phase: 'local', pending: 0, conflicts: 0, lastSyncedAt: null, error: null };

export const QuestionDatabaseContextValue = createContext<QuestionDatabaseContext | null>(null);

export function useQuestionDatabase() { return useContext(QuestionDatabaseContextValue); }
