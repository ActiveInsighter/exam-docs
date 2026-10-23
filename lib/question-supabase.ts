import type { SupabaseClient } from '@supabase/supabase-js';
import { validateAnnotationResponse } from './question-store/annotations';
import {
  validateIdentity,
  validateRemote,
  validateState,
  type QuestionSyncTransport,
  type SyncResponse,
} from './question-store/types';

export { cloudConfigured as questionCloudConfigured, getSupabaseClient as getQuestionSupabaseClient } from './supabase-client';

const RPC_TIMEOUT_MS = 20_000;

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

function describeRpcError(error: { code?: string; message: string }): Error {
  const text = `${error.code} ${error.message}`;
  if (/abort|timeout/i.test(text)) return new Error('云同步超时，答案已保存在本机，稍后自动重试。');
  if (/jwt|token/i.test(text) || error.code === 'PGRST301') return new Error('登录已失效，请重新登录后继续同步。');
  if (/function .* does not exist|PGRST202/i.test(text)) return new Error('云端同步服务正在升级，答案已保存在本机，稍后自动重试。');
  return new Error(`云同步失败：${error.message}`);
}

const isMissingFunction = (error: { code?: string; message: string }) =>
  /function .* does not exist|PGRST202/i.test(`${error.code} ${error.message}`);

export function createQuestionTransport(client: SupabaseClient, userId: string): QuestionSyncTransport {
  /** Refuses a request if the account changed while a retry was waiting. */
  async function call(name: string, args: Record<string, unknown>) {
    const { data: { session }, error: authError } = await client.auth.getSession();
    if (authError) throw authError;
    if (session?.user.id !== userId) throw new Error('登录状态已变化，请重新同步');
    // Always cancel the underlying fetch, including browsers without the newer
    // AbortSignal.timeout API. Merely racing a timeout leaves requests alive
    // while the engine retries, accumulating work on a stalled mobile network.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      return await client.rpc(name, args)
        .setHeader('Authorization', `Bearer ${session.access_token}`)
        .abortSignal(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async sync({ operations, cursor, limit }) {
      const { data, error } = await call('exam_sync_question_state', {
        p_operations: operations,
        p_cursor: cursor ?? '0',
        p_limit: limit,
      });
      if (error) throw describeRpcError(error);
      validateSyncResponse(data);
      return data;
    },
    async syncAnnotations({ tags, marks, cursor, limit }) {
      const { data, error } = await call('exam_sync_question_annotations', {
        p_tags: tags,
        p_marks: marks,
        p_cursor: cursor ?? '0',
        p_limit: limit,
      });
      // Answers keep syncing while a deployment has not created the function yet.
      if (error && isMissingFunction(error)) return null;
      if (error) throw describeRpcError(error);
      validateAnnotationResponse(data);
      return data;
    },
  };
}
