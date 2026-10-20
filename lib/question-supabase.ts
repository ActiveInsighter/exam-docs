import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateIdentity,
  validateRemote,
  validateState,
  type QuestionSyncTransport,
  type SyncResponse,
} from './question-store/types';

export const questionCloudConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

let clientPromise: Promise<SupabaseClient> | undefined;

/** Loaded only in a configured browser; static rendering never contacts Supabase. */
export function getQuestionSupabaseClient(): Promise<SupabaseClient> {
  if (!questionCloudConfigured) return Promise.reject(new Error('尚未配置云同步'));
  return (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
    ),
  ));
}

export function validateSyncResponse(value: unknown): asserts value is SyncResponse {
  if (!value || typeof value !== 'object') throw new Error('云同步返回格式有误');
  const data = value as SyncResponse;
  if (!Array.isArray(data.receipts) || !Array.isArray(data.changes) || !Array.isArray(data.attempts) ||
    typeof data.hasMore !== 'boolean' || typeof data.cursor !== 'string' || !/^\d+$/.test(data.cursor)) {
    throw new Error('云同步返回格式有误');
  }
  for (const record of data.changes) validateRemote(record);
  for (const receipt of data.receipts) {
    if (typeof receipt.operationId !== 'string' || !['applied', 'conflict'].includes(receipt.status)) {
      throw new Error('云同步确认格式有误');
    }
    validateRemote(receipt.record);
  }
  for (const attempt of data.attempts) {
    validateIdentity(attempt);
    validateState(attempt.state);
    if (typeof attempt.attemptId !== 'string' || !Number.isFinite(Date.parse(attempt.createdAt))) {
      throw new Error('云端答题历史格式有误');
    }
  }
}

export function createQuestionTransport(client: SupabaseClient, userId: string): QuestionSyncTransport {
  return {
    async sync({ operations, cursor, limit }) {
      // Refuse a request if the account changed while a retry was waiting.
      const { data: { session }, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      if (session?.user.id !== userId) throw new Error('登录状态已变化，请重新同步');
      const { data, error } = await client.rpc('exam_sync_question_state', {
        p_operations: operations,
        p_cursor: cursor ?? '0',
        p_limit: limit,
      }).setHeader('Authorization', `Bearer ${session.access_token}`);
      if (error) throw new Error(`云同步失败：${error.message}`);
      validateSyncResponse(data);
      return data;
    },
  };
}
