import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseFetch } from '@/lib/supabase-fetch';
import { accountErrorMessage } from '@/lib/account/errors';
import worker from '../worker';

const project = 'https://hqtpzhefihdwllbqjeot.supabase.co';
const gateway = 'https://exam.any1.tech/api/supabase';
const env = { SUPABASE_URL: project, ASSETS: { fetch: vi.fn(() => new Response('static')) } };

afterEach(() => vi.unstubAllGlobals());

describe('same-origin account and question connectivity', () => {
  it('routes actual SDK email, code, and question RPC requests through the site while preserving session storage identity', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      requests.push(request);
      return Response.json({});
    }));
    const client = createClient(project, 'sb_publishable_test', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: createSupabaseFetch(project, gateway) },
    });
    await client.auth.signInWithOtp({ email: 'test@example.com', options: { emailRedirectTo: 'https://exam.any1.tech/docs/math/' } });
    await client.auth.verifyOtp({ email: 'test@example.com', token: '123456', type: 'email' });
    await client.rpc('exam_sync', { p_changes: {}, p_cursor: '0', p_limit: 100 });
    expect(requests.map(r => new URL(r.url).pathname)).toEqual([
      '/api/supabase/auth/v1/otp', '/api/supabase/auth/v1/verify', '/api/supabase/rest/v1/rpc/exam_sync',
    ]);
    expect(requests.every(r => new URL(r.url).origin === 'https://exam.any1.tech')).toBe(true);
    expect(new URL(requests[0].url).searchParams.get('redirect_to')).toBe('https://exam.any1.tech/docs/math/');
    expect((await requests[0].json()).email).toBe('test@example.com');
    expect(requests[0].headers.get('apikey')).toBe('sb_publishable_test');
    expect(client.auth.storageKey).toBe('sb-hqtpzhefihdwllbqjeot-auth-token');
  });

  it('streams the caller JWT and RPC body to the fixed project without forwarding site cookies or caching private data', async () => {
    const upstream = vi.fn(async (request: Request) => {
      expect(request.url).toBe(`${project}/rest/v1/rpc/exam_sync`);
      expect(request.headers.get('Authorization')).toBe('Bearer caller-jwt');
      expect(request.headers.get('apikey')).toBe('sb_publishable_test');
      expect(request.headers.has('Cookie')).toBe(false);
      expect(request.headers.has('X-Forwarded-Host')).toBe(false);
      expect(await request.json()).toEqual({ p_changes: {} });
      return Response.json({ cursor: '1' }, { headers: { 'Set-Cookie': 'upstream=private', 'Cache-Control': 'public' } });
    });
    vi.stubGlobal('fetch', upstream);
    const response = await worker.fetch(new Request(`${gateway}/rest/v1/rpc/exam_sync`, {
      method: 'POST', headers: { Authorization: 'Bearer caller-jwt', apikey: 'sb_publishable_test', Cookie: 'site=private', Origin: 'https://exam.any1.tech', 'X-Forwarded-Host': 'evil.example' }, body: JSON.stringify({ p_changes: {} }),
    }), env);
    expect(await response.json()).toEqual({ cursor: '1' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it('preserves Supabase authorization failures instead of granting access', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'PGRST301', message: 'JWT expired' }, { status: 401 })));
    const response = await worker.fetch(new Request(`${gateway}/rest/v1/rpc/exam_sync`, { method: 'POST', body: '{}' }), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'PGRST301' });
  });

  it('rejects cross-site, admin, unsupported methods and target injection without contacting Supabase', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    for (const [request, status] of [
      [new Request(`${gateway}/auth/v1/otp`, { method: 'POST', headers: { Origin: 'https://evil.example' } }), 403],
      [new Request(`${gateway}/auth/v1/admin/users`), 404],
      [new Request(`${gateway}//evil.example/auth/v1/otp`), 404],
      [new Request(`${gateway}/auth/v1/otp`), 405],
    ] as const) expect((await worker.fetch(request, env)).status).toBe(status);
    expect((await worker.fetch(new Request(`${gateway}/auth/v1/settings`), { ...env, SUPABASE_URL: 'https://evil.example' })).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns a retryable Chinese error when the upstream network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await worker.fetch(new Request(`${gateway}/auth/v1/settings`), env);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: '登录服务暂时无法连接，请稍后重试。' });
  });

  it('no longer relays Realtime WebSockets', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await worker.fetch(new Request(`${gateway}/realtime/v1/websocket?apikey=sb_publishable_test&vsn=2.0.0`, {
      headers: { Origin: 'https://exam.any1.tech', Upgrade: 'websocket' },
    }), env);
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('keeps static document requests on the assets binding', async () => {
    expect(await (await worker.fetch(new Request('https://exam.any1.tech/docs/math/'), env)).text()).toBe('static');
  });

  it('explains network, mail restrictions and expired codes in Chinese', () => {
    expect(accountErrorMessage(new TypeError('Failed to fetch'))).toContain('检查网络');
    expect(accountErrorMessage({ code: 'email_address_not_authorized' })).toContain('联系站点管理员');
    expect(accountErrorMessage({ status: 429 })).toContain('过于频繁');
    expect(accountErrorMessage({ code: 'otp_expired' })).toContain('已失效');
  });
});
