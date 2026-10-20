'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { QuestionDatabase, QuestionSyncEngine } from '@/lib/question-store';
import { namespaceForUser, type QuestionNamespace } from '@/lib/question-store/types';
import { createQuestionTransport, getQuestionSupabaseClient, questionCloudConfigured } from '@/lib/question-supabase';

type DatabaseContext = {
  database: QuestionDatabase | null;
  namespace: QuestionNamespace;
  user: User | null;
  cachedAccount: { id: string; email?: string } | null;
  engine: QuestionSyncEngine | null;
  ready: boolean;
  error: string | null;
};

const Context = createContext<DatabaseContext | null>(null);

export function useQuestionDatabase() { return useContext(Context); }

export function QuestionDatabaseProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<QuestionDatabase | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [cachedAccount, setCachedAccount] = useState<{ id: string; email?: string } | null>(null);
  const [engine, setEngine] = useState<QuestionSyncEngine | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const namespace = namespaceForUser(user?.id ?? cachedAccount?.id);
  const accountKey = `exam-docs:last-account:${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'local'}`;

  useEffect(() => {
    if (!questionCloudConfigured) return;
    try {
      const saved = JSON.parse(localStorage.getItem(accountKey) ?? 'null') as { id?: string; email?: string } | null;
      if (saved?.id) {
        namespaceForUser(saved.id);
        setCachedAccount({ id: saved.id, email: typeof saved.email === 'string' ? saved.email : undefined });
      }
    } catch { /* Cache selection is optional and never authorizes a cloud request. */ }
  }, [accountKey]);

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

  useEffect(() => {
    if (!questionCloudConfigured) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void getQuestionSupabaseClient().then(async (client) => {
      if (disposed) return;
      let authEvent = false;
      const applyAccount = (account: User | null) => {
        if (disposed) return;
        setUser(account);
        const selected = account ? { id: account.id, email: account.email } : null;
        setCachedAccount(selected);
        try {
          if (selected) localStorage.setItem(accountKey, JSON.stringify(selected));
          else localStorage.removeItem(accountKey);
        } catch { /* IndexedDB remains authoritative even if localStorage is disabled. */ }
      };
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        authEvent = true;
        if (session?.user || event === 'SIGNED_OUT') applyAccount(session?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!disposed && !authEvent && data.session) applyAccount(data.session.user);
    }).catch(() => {
      if (!disposed) setError('登录状态读取失败，答题仍保存在本机。');
    });
    return () => { disposed = true; unsubscribe?.(); };
  }, [accountKey]);

  useEffect(() => {
    if (!database || !user) { setEngine(null); return; }
    let disposed = false;
    let active: QuestionSyncEngine | undefined;
    void getQuestionSupabaseClient().then((client) => {
      if (disposed) return;
      active = new QuestionSyncEngine(database, namespace, createQuestionTransport(client, user.id));
      setEngine(active);
      active.start();
    }).catch(() => {
      if (!disposed) setError('云同步暂时无法启动，答题继续保存在本机。');
    });
    return () => { disposed = true; active?.stop(); };
  }, [database, namespace, user?.id]);

  const value = useMemo(() => ({ database, namespace, user, cachedAccount, engine, ready: localReady, error }),
    [database, namespace, user, cachedAccount, engine, localReady, error]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
