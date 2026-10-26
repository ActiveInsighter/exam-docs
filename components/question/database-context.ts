'use client';

import { createContext, useContext } from 'react';
import type { AccountIdentity } from '@/lib/account/types';
import type { QuestionAnnotationCache, QuestionAnswerCache, QuestionDatabase, QuestionSyncEngine } from '@/lib/question-store';
import type { QuestionNamespace, QuestionSyncStatus } from '@/lib/question-store/types';

export type QuestionDatabaseContext = {
  database: QuestionDatabase | null;
  /** Memory cache every question reads from; null until the browser database has been opened (or failed). */
  cache: QuestionAnswerCache | null;
  /** The reader's tags, favourites and notes; same lifecycle as `cache`. */
  annotations: QuestionAnnotationCache | null;
  namespace: QuestionNamespace;
  user: AccountIdentity | null;
  cachedAccount: AccountIdentity | null;
  /** The account's sync engine; null for guests. Connected only with a verified session. */
  engine: QuestionSyncEngine | null;
  status: QuestionSyncStatus;
  ready: boolean;
  error: string | null;
  /** Opens the overview of starred, tagged and annotated questions. */
  openLibrary(): void;
};

export const LOCAL_STATUS: QuestionSyncStatus = { phase: 'local', pending: 0, lastSyncedAt: null, error: null };

export const QuestionDatabaseContextValue = createContext<QuestionDatabaseContext | null>(null);

export function useQuestionDatabase() { return useContext(QuestionDatabaseContextValue); }

/**
 * The part of the context every question reads. It changes only when the
 * account or the database changes, never on sync progress, so a page of a
 * hundred questions does not re-render while answers upload.
 */
export type QuestionStorage = {
  cache: QuestionAnswerCache | null;
  annotations: QuestionAnnotationCache | null;
  namespace: QuestionNamespace;
};

export const QuestionStorageContext = createContext<QuestionStorage | null>(null);

export function useQuestionStorage() { return useContext(QuestionStorageContext); }
