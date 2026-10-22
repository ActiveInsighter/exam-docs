'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccount, useAccountMenuSection } from '@/components/account';
import { QuestionAnswerCache, QuestionDatabase, QuestionSyncEngine } from '@/lib/question-store';
import { namespaceForUser, type QuestionSyncStatus } from '@/lib/question-store/types';
import { createQuestionTransport, getQuestionSupabaseClient } from '@/lib/question-supabase';
import { questionAccountSection } from './account-section';
import { QuestionConflictDialog } from './conflict-dialog';
import { LOCAL_STATUS, QuestionDatabaseContextValue, type QuestionDatabaseContext } from './database-context';

export { useQuestionDatabase } from './database-context';

/**
 * Site-wide owner of the reader's answers: one IndexedDB connection, one
 * memory cache per account namespace, and (when signed in) one sync engine
 * woken by edits and page lifecycle events. No long-lived socket is kept
 * open: mobile browsers pay for an idle WebSocket in memory and battery, and
 * a pull on return to the page covers other devices' changes.
 */
export function QuestionDatabaseProvider({ children }: { children: ReactNode }) {
  const { user, cachedUser: cachedAccount, error: accountError } = useAccount();
  const [database, setDatabase] = useState<QuestionDatabase | null>(null);
  const [engine, setEngine] = useState<QuestionSyncEngine | null>(null);
  const [status, setStatus] = useState<QuestionSyncStatus>(LOCAL_STATUS);
  const [localReady, setLocalReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
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
    }).catch(() => {
      if (!disposed) {
        setError('浏览器数据库无法打开，当前答案无法持久保存。请检查浏览器存储权限。');
        setLocalReady(true);
      }
    });
    return () => { disposed = true; opened?.close(); };
  }, []);

  const [cache, setCache] = useState<QuestionAnswerCache | null>(null);
  // Created in an effect so a (Strict Mode) remount disposes exactly the cache it created.
  useEffect(() => {
    if (!localReady) return;
    const created = new QuestionAnswerCache(database, namespace);
    setCache(created);
    return () => { created.dispose(); setCache((current) => (current === created ? null : current)); };
  }, [localReady, database, namespace]);

  useEffect(() => {
    if (!database || !user) { setEngine(null); return; }
    let disposed = false;
    let active: QuestionSyncEngine | undefined;
    void getQuestionSupabaseClient().then((client) => {
      if (disposed) return;
      const current = new QuestionSyncEngine(database, namespace, createQuestionTransport(client, user.id));
      active = current;
      setEngine(current);
      current.start();
    }).catch(() => {
      if (!disposed) setError('云同步暂时无法启动，答题继续保存在本机。');
    });
    return () => { disposed = true; active?.stop(); };
  }, [database, namespace, user?.id]);

  useEffect(() => {
    if (engine) return engine.subscribe(setStatus);
    setStatus(LOCAL_STATUS);
  }, [engine]);

  const value = useMemo<QuestionDatabaseContext>(() => ({
    database, cache, namespace, user, cachedAccount, engine, status, ready: localReady,
    error: error ?? accountError, openConflicts: () => setConflictsOpen(true),
  }), [database, cache, namespace, user, cachedAccount, engine, status, localReady, error, accountError]);
  return (
    <QuestionDatabaseContextValue.Provider value={value}>
      {children}
      <QuestionConflictDialog open={conflictsOpen} onOpenChange={setConflictsOpen} />
    </QuestionDatabaseContextValue.Provider>
  );
}
