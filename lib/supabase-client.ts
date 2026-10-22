import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseFetch } from './supabase-fetch';

/*
 * One browser Supabase client shared by every feature (account, question sync,
 * future modules). Only public project configuration is read here; the
 * publishable key is a project identifier, authorization comes from the user
 * session and database policies.
 */
export const cloudConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

let clientPromise: Promise<SupabaseClient> | undefined;

/** localStorage key under which the auth SDK persists the session (its default naming). */
export const authStorageKey = cloudConfigured
  ? `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`
  : null;

/**
 * Whether this browser may hold a session: a persisted one, or an auth
 * redirect in the URL. Guests skip loading the SDK entirely (no token refresh
 * ticker, lock polling or lifecycle listeners); it loads on the first sign-in
 * action or when another tab signs in.
 */
export function mayHaveSession(): boolean {
  if (!cloudConfigured || typeof window === 'undefined') return false;
  const { hash, search } = window.location;
  if (/[#&](access_token|refresh_token|error_description)=/.test(hash) || /[?&](code|token_hash|error_description)=/.test(search)) return true;
  try {
    return Object.keys(localStorage).some((key) => key === authStorageKey || key.startsWith(`${authStorageKey}.`));
  } catch {
    return true; // Storage unreadable: let the SDK decide.
  }
}

/** Loaded only in a configured browser; static rendering never contacts Supabase. */
export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('尚未配置云端账号'));
  return (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    // HTTP calls use the same-origin gateway when configured.
    const proxyUrl = process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH && typeof window !== 'undefined'
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH, window.location.origin).href
      : null;
    return createClient(projectUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: proxyUrl ? { fetch: createSupabaseFetch(projectUrl, proxyUrl) } : undefined,
    });
  }));
}
