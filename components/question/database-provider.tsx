'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAccount, useAccountMenuSection } from '@/components/account';
import { QuestionDatabase, QuestionSession } from '@/lib/question-store';
import { namespaceForUser, type QuestionSyncStatus } from '@/lib/question-store/types';
import { createQuestionTransport, getQuestionSupabaseClient } from '@/lib/question-supabase';
import { questionAccountSection } from './account-section';
import { LOCAL_STATUS, QuestionDatabaseContextValue, QuestionStorageContext, type QuestionDatabaseContext, type QuestionStorage } from './database-context';

export { useQuestionDatabase } from './database-context';

// Rarely opened: loaded on first use.
const QuestionLibraryDialog = lazy(() => import('./marks/library-dialog').then((module) => ({ default: module.QuestionLibraryDialog })));

/**
 * Site-wide owner of the reader's answers: one IndexedDB connection and one
 * QuestionSession per reader identity (memory caches plus, for an account,
 * the sync engine). The engine is connected only while a verified session
 * for that account exists; until then commits queue up locally.
 */
export function QuestionDatabaseProvider({ children }: { children: ReactNode }) {
  const { user, cachedUser: cachedAccount, error: accountError } = useAccount();
  const [database, setDatabase] = useState<QuestionDatabase | null>(null);
  const [syncError, setSyncError] = useState<{ engine: QuestionSession['sync']; message: string } | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const namespace = namespaceForUser(user?.id ?? cachedAccount?.id);
  useAccountMenuSection(questionAccountSection);

  useEffect(() => {
    let disposed = false;
    let opened: QuestionDatabase | undefined;
    void QuestionDatabase.open().then((db) => {
      opened = db;
      if (disposed) return db.close();
      setDatabase(db);
      setLocalReady(true);
      // Ask the browser not to evict the reader's answers under storage pressure (best effort).
      void navigator.storage?.persist?.().catch(() => undefined);
    }).catch(() => {
      if (!disposed) {
        setError('浏览器数据库无法打开，答案只保留在当前页面；登录后提交的答案仍会同步到云端。');
        setLocalReady(true);
      }
    });
    return () => { disposed = true; opened?.close(); };
  }, []);

  const [session, setSession] = useState<QuestionSession | null>(null);
  // Created in an effect so a (Strict Mode) remount disposes exactly the session it created.
  useEffect(() => {
    if (!localReady) return;
    const created = new QuestionSession(database, namespace);
    setSession(created);
    return () => {
      created.dispose();
      setSession((current) => (current === created ? null : current));
    };
  }, [localReady, database, namespace]);

  // Effects replace the session after this render. Never expose the previous
  // identity's caches, status or engine in that transition render.
  const activeSession = localReady && session?.namespace === namespace && session.database === database ? session : null;
  const engine = activeSession?.sync ?? null;
  const userId = user?.id;
  useEffect(() => {
    if (!engine || !userId || engine.namespace !== namespaceForUser(userId)) return;
    let disposed = false;
    void getQuestionSupabaseClient().then((client) => {
      if (!disposed) engine.connect(createQuestionTransport(client, userId));
    }).catch(() => {
      if (!disposed) setSyncError({ engine, message: '云同步暂时无法启动，答题继续保存在本机。' });
    });
    return () => { disposed = true; engine.disconnect(); };
  }, [engine, userId]);

  const subscribeStatus = useCallback((changed: () => void) => engine?.subscribe(changed) ?? (() => {}), [engine]);
  const readStatus = useCallback((): QuestionSyncStatus => engine?.status ?? LOCAL_STATUS, [engine]);
  const status = useSyncExternalStore(subscribeStatus, readStatus, () => LOCAL_STATUS);

  const cache = activeSession?.answers ?? null;
  const annotations = activeSession?.annotations ?? null;
  const ready = activeSession !== null;
  const failure = error ?? (syncError?.engine === engine ? syncError?.message : null) ?? accountError;
  const openLibrary = useCallback(() => { setLibraryLoaded(true); setLibraryOpen(true); }, []);
  const value = useMemo<QuestionDatabaseContext>(() => ({
    database, cache, annotations, namespace, user, cachedAccount, engine, status, ready,
    error: failure, openLibrary,
  }), [database, cache, annotations, namespace, user, cachedAccount, engine, status, ready, failure, openLibrary]);
  // Inside the provider, null caches mean "still opening": questions wait instead of using memory.
  const storage = useMemo<QuestionStorage>(() => ({ cache, annotations, namespace }), [cache, annotations, namespace]);
  return (
    <QuestionDatabaseContextValue.Provider value={value}>
      <QuestionStorageContext.Provider value={storage}>
        {children}
        {libraryLoaded ? (
          <Suspense fallback={null}>
            <QuestionLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} />
          </Suspense>
        ) : null}
      </QuestionStorageContext.Provider>
    </QuestionDatabaseContextValue.Provider>
  );
}
