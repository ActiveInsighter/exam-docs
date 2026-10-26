import type { SupabaseClient } from '@supabase/supabase-js';
import { validateSyncResponse } from './question-store/protocol';
import type { QuestionSyncTransport } from './question-store/types';

export { cloudConfigured as questionCloudConfigured, getSupabaseClient as getQuestionSupabaseClient } from './supabase-client';
export { validateSyncResponse };

const RPC_TIMEOUT_MS = 20_000;

function describeRpcError(error: { code?: string; message: string }): Error {
  const text = `${error.code} ${error.message}`;
  if (/abort|timeout/i.test(text)) return new Error('云同步超时，稍后自动重试。');
  if (/jwt|token/i.test(text) || error.code === 'PGRST301') return new Error('登录已失效，请重新登录后继续同步。');
  if (/function .* does not exist|PGRST202/i.test(text)) return new Error('云端同步服务正在升级，答案已保存在本机，稍后自动重试。');
  return new Error(`云同步失败：${error.message}`);
}

/** The one RPC of question sync (public.exam_sync), bound to the verified account. */
export function createQuestionTransport(client: SupabaseClient, userId: string): QuestionSyncTransport {
  return {
    async sync({ changes, cursor, limit }) {
      // Refuses a request if the account changed while a retry was waiting.
      const { data: { session }, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      if (session?.user.id !== userId) throw new Error('登录状态已变化，请重新同步');
      // Always cancel the underlying fetch, including browsers without the newer
      // AbortSignal.timeout API. Merely racing a timeout leaves requests alive
      // while the engine retries, accumulating work on a stalled mobile network.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const { data, error } = await client.rpc('exam_sync', { p_changes: changes, p_cursor: cursor ?? '0', p_limit: limit })
          .setHeader('Authorization', `Bearer ${session.access_token}`)
          .abortSignal(controller.signal);
        if (error) throw describeRpcError(error);
        validateSyncResponse(data);
        return data;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
