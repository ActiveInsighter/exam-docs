'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { cloudConfigured, getSupabaseClient } from '@/lib/supabase-client';
import type { AccountIdentity, AccountPhase, AccountState } from '@/lib/account/types';
import { AccountMenuRegistry } from './menu-registry';

/*
 * The single owner of "who is signed in". Features read it through
 * useAccount(); they never talk to the auth vendor themselves. Dependencies
 * point one way: feature modules (questions, ...) import the account, the
 * account never imports a feature.
 */

const Context = createContext<AccountState | null>(null);

export function useAccount(): AccountState {
  const value = useContext(Context);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>');
  return value;
}

const cacheKey = `exam-docs:last-account:${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'local'}`;

function toIdentity(user: User): AccountIdentity {
  return { id: user.id, email: user.email };
}

function readCachedIdentity(): AccountIdentity | null {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as { id?: unknown; email?: unknown } | null;
    if (typeof saved?.id !== 'string' || !saved.id) return null;
    return { id: saved.id, email: typeof saved.email === 'string' ? saved.email : undefined };
  } catch {
    return null; // The cache is optional and never authorizes a cloud request.
  }
}

function writeCachedIdentity(identity: AccountIdentity | null) {
  try {
    if (identity) localStorage.setItem(cacheKey, JSON.stringify(identity));
    else localStorage.removeItem(cacheKey);
  } catch { /* Local data stays usable even if localStorage is disabled. */ }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountIdentity | null>(null);
  const [cachedUser, setCachedUser] = useState<AccountIdentity | null>(null);
  const [sessionRead, setSessionRead] = useState(!cloudConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudConfigured) return;
    setCachedUser(readCachedIdentity());
  }, []);

  useEffect(() => {
    if (!cloudConfigured) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void getSupabaseClient().then(async (client) => {
      if (disposed) return;
      let authEvent = false;
      const apply = (account: User | null) => {
        if (disposed) return;
        const identity = account ? toIdentity(account) : null;
        setUser(identity);
        setCachedUser(identity);
        writeCachedIdentity(identity);
      };
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        authEvent = true;
        if (session?.user || event === 'SIGNED_OUT') apply(session?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!disposed && !authEvent && data.session) apply(data.session.user);
    }).catch(() => {
      if (!disposed) setError('登录状态读取失败，仍可以未登录使用。');
    }).finally(() => {
      if (!disposed) setSessionRead(true);
    });
    return () => { disposed = true; unsubscribe?.(); };
  }, []);

  const sendEmailLink = useCallback(async (email: string) => {
    const client = await getSupabaseClient();
    const { error: failure } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (failure) throw failure;
  }, []);

  const verifyEmailCode = useCallback(async (email: string, token: string) => {
    const client = await getSupabaseClient();
    const { error: failure } = await client.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
    if (failure) throw failure;
  }, []);

  const signOut = useCallback(async () => {
    const client = await getSupabaseClient();
    const { error: failure } = await client.auth.signOut({ scope: 'local' });
    if (failure) throw failure;
  }, []);

  const phase: AccountPhase = !cloudConfigured ? 'disabled' : !sessionRead ? 'loading' : user ? 'signed-in' : 'guest';
  const value = useMemo<AccountState>(
    () => ({ phase, user, cachedUser, error, sendEmailLink, verifyEmailCode, signOut }),
    [phase, user, cachedUser, error, sendEmailLink, verifyEmailCode, signOut],
  );
  return (
    <Context.Provider value={value}>
      <AccountMenuRegistry>{children}</AccountMenuRegistry>
    </Context.Provider>
  );
}
