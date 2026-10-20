import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createQuestionTransport } from '@/lib/question-supabase';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const response = { receipts: [], changes: [], attempts: [], cursor: '0', hasMore: false };

function clientFor(actor: string, data: unknown = response) {
  const setHeader = vi.fn().mockResolvedValue({ data, error: null });
  const rpc = vi.fn().mockReturnValue({ setHeader });
  const client = {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'original-account-token' } }, error: null }) },
    rpc,
  } as unknown as SupabaseClient;
  return { client, rpc, setHeader };
}

describe('Supabase question transport', () => {
  it('pins the verified account token on the request even if the shared auth client changes', async () => {
    const { client, rpc, setHeader } = clientFor(userId);
    expect(await createQuestionTransport(client, userId).sync({ operations: [], cursor: null, limit: 100 })).toEqual(response);
    expect(rpc).toHaveBeenCalledWith('exam_sync_question_state', { p_operations: [], p_cursor: '0', p_limit: 100 });
    expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer original-account-token');
  });

  it('refuses an old account retry before any RPC is sent', async () => {
    const { client, rpc } = clientFor('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await expect(createQuestionTransport(client, userId).sync({ operations: [], cursor: '3', limit: 100 })).rejects.toThrow('登录状态已变化');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed cloud responses before the durable outbox can be acknowledged', async () => {
    const { client } = clientFor(userId, { ...response, attempts: undefined });
    await expect(createQuestionTransport(client, userId).sync({ operations: [], cursor: null, limit: 100 })).rejects.toThrow('返回格式有误');
  });
});
