import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseFetch, createSupabaseWebSocket } from './supabase-fetch';

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

/** Loaded only in a configured browser; static rendering never contacts Supabase. */
export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('尚未配置云端账号'));
  return (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    // HTTP and the Realtime WebSocket both use the same-origin gateway when configured.
    const proxyUrl = process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH && typeof window !== 'undefined'
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH, window.location.origin).href
      : null;
    return createClient(projectUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: proxyUrl ? { fetch: createSupabaseFetch(projectUrl, proxyUrl) } : undefined,
      realtime: proxyUrl ? { transport: createSupabaseWebSocket(projectUrl, proxyUrl) } : undefined,
    });
  }));
}
