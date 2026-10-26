import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuestionTransport } from '@/lib/question-supabase';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const response = { answers: [], attempts: [], tags: [], marks: [], merged: [], cursor: '0', hasMore: false };
const changes = { answers: [], attempts: [], tags: [], marks: [] };

function clientFor(actor: string, data: unknown = response, error: unknown = null) {
  // A thenable stand-in for the PostgREST builder chain.
  const builder = {
    abortSignal: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: error ? null : data, error }).then(resolve, reject),
  };
  const setHeader = vi.fn().mockReturnValue(builder);
  const rpc = vi.fn().mockReturnValue({ setHeader });
  const client = {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'original-account-token' } }, error: null }) },
    rpc,
  } as unknown as SupabaseClient;
  return { client, rpc, setHeader, abortSignal: builder.abortSignal };
}

describe('Supabase question transport', () => {
  afterEach(() => vi.useRealTimers());

  it('actually aborts stalled RPCs without AbortSignal.timeout and clears finished timers', async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => { throw new Error('Unavailable on this browser'); });
    const { client, abortSignal } = clientFor(userId);
    await createQuestionTransport(client, userId).sync({ changes, cursor: null, limit: 100 });
    expect(vi.getTimerCount()).toBe(0);

    let signal: AbortSignal | undefined;
    const stalled = {
      setHeader: () => stalled,
      abortSignal: (value: AbortSignal) => { signal = value; return stalled; },
      then: (resolve: (value: unknown) => void) => new Promise<void>((done) => {
        signal!.addEventListener('abort', () => {
          resolve({ data: null, error: { message: 'AbortError' } }); done();
        }, { once: true });
      }),
    };
    vi.mocked(client.rpc).mockReturnValue(stalled as never);
    const pending = createQuestionTransport(client, userId).sync({ changes, cursor: null, limit: 100 });
    const rejected = expect(pending).rejects.toThrow('云同步超时');
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(abortSignal).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('pins the verified account token on the request even if the shared auth client changes', async () => {
    const { client, rpc, setHeader } = clientFor(userId);
    expect(await createQuestionTransport(client, userId).sync({ changes, cursor: null, limit: 100 })).toEqual(response);
    expect(rpc).toHaveBeenCalledWith('exam_sync', { p_changes: changes, p_cursor: '0', p_limit: 100 });
    expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer original-account-token');
  });

  it('bounds every request with a timeout so a stalled connection cannot hold the sync turn', async () => {
    const { client, abortSignal } = clientFor(userId);
    await createQuestionTransport(client, userId).sync({ changes, cursor: null, limit: 100 });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    const aborted = clientFor(userId, response, { code: '20', message: 'AbortError: signal timed out' });
    await expect(createQuestionTransport(aborted.client, userId).sync({ changes, cursor: null, limit: 100 })).rejects.toThrow('云同步超时');
  });

  it('refuses an old account retry before any RPC is sent', async () => {
    const { client, rpc } = clientFor('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await expect(createQuestionTransport(client, userId).sync({ changes, cursor: '3', limit: 100 })).rejects.toThrow('登录状态已变化');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed cloud responses before anything is acknowledged', async () => {
    const { client } = clientFor(userId, { ...response, attempts: undefined });
    await expect(createQuestionTransport(client, userId).sync({ changes, cursor: null, limit: 100 })).rejects.toThrow('返回格式有误');
  });
});
