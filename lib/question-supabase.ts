import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateIdentity,
  validateRemote,
  validateState,
  type QuestionSyncTransport,
  type SyncResponse,
} from './question-store/types';

export { cloudConfigured as questionCloudConfigured, getSupabaseClient as getQuestionSupabaseClient } from './supabase-client';

export function validateSyncResponse(value: unknown): asserts value is SyncResponse {
  if (!value || typeof value !== 'object') throw new Error('云同步返回格式有误');
  const data = value as SyncResponse;
  if (!Array.isArray(data.receipts) || !Array.isArray(data.changes) || !Array.isArray(data.attempts) ||
    typeof data.hasMore !== 'boolean' || typeof data.cursor !== 'string' || !/^\d+$/.test(data.cursor) ||
    (data.reset !== undefined && typeof data.reset !== 'boolean')) {
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
      if (error) {
        if (/jwt|token/i.test(`${error.code} ${error.message}`) || error.code === 'PGRST301') throw new Error('登录已失效，请重新登录后继续同步。');
        if (/function .* does not exist|PGRST202/i.test(`${error.code} ${error.message}`)) throw new Error('云端同步服务正在升级，答案已保存在本机，稍后自动重试。');
        throw new Error(`云同步失败：${error.message}`);
      }
      validateSyncResponse(data);
      return data;
    },
  };
}

export interface QuestionRealtimeHandlers {
  /** The account feed advanced to `cursor` on another device or tab. */
  onChanged(cursor: string): void;
  /** The private channel is joined (true) or interrupted (false). */
  onLive(live: boolean): void;
}

/**
 * Listens to the account's private broadcast topic. The database sends a poke
 * after each committed sync; the payload holds only the new cursor, never
 * answers, and RLS on realtime.messages admits only the topic's owner.
 */
export function subscribeQuestionRealtime(client: SupabaseClient, userId: string, handlers: QuestionRealtimeHandlers): () => void {
  let disposed = false;
  let channel: ReturnType<SupabaseClient['channel']> | undefined;
  void (async () => {
    const { data: { session } } = await client.auth.getSession();
    if (disposed || session?.user.id !== userId) return;
    // Private channels authorize the join with the user's JWT, not the publishable key.
    await client.realtime.setAuth(session.access_token);
    if (disposed) return;
    channel = client.channel(`exam-sync:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, (message: { payload?: { cursor?: unknown } }) => {
        const cursor = message.payload?.cursor;
        if (typeof cursor === 'string') handlers.onChanged(cursor);
      })
      .subscribe((status) => {
        if (!disposed) handlers.onLive(status === 'SUBSCRIBED');
      });
  })().catch(() => { if (!disposed) handlers.onLive(false); });
  return () => {
    disposed = true;
    if (channel) void client.removeChannel(channel);
  };
}
