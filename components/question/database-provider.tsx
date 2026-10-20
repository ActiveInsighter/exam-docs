'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccount } from '@/components/account';
import type { AccountIdentity } from '@/lib/account/types';
import { QuestionDatabase, QuestionSyncEngine } from '@/lib/question-store';
import { namespaceForUser, type QuestionNamespace } from '@/lib/question-store/types';
import { createQuestionTransport, getQuestionSupabaseClient } from '@/lib/question-supabase';

type DatabaseContext = {
  database: QuestionDatabase | null;
  namespace: QuestionNamespace;
  user: AccountIdentity | null;
  cachedAccount: AccountIdentity | null;
  engine: QuestionSyncEngine | null;
  ready: boolean;
  error: string | null;
};

const Context = createContext<DatabaseContext | null>(null);

export function useQuestionDatabase() { return useContext(Context); }

export function QuestionDatabaseProvider({ children }: { children: ReactNode }) {
  const { user, cachedUser: cachedAccount, error: accountError } = useAccount();
  const [database, setDatabase] = useState<QuestionDatabase | null>(null);
  const [engine, setEngine] = useState<QuestionSyncEngine | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const namespace = namespaceForUser(user?.id ?? cachedAccount?.id);

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

  const value = useMemo(() => ({ database, namespace, user, cachedAccount, engine, ready: localReady, error: error ?? accountError }),
    [database, namespace, user, cachedAccount, engine, localReady, error, accountError]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
