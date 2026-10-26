const PREFIX = '/api/supabase';
const ENDPOINTS = new Map([
  ['/auth/v1/settings', ['GET', 'HEAD']],
  ['/auth/v1/otp', ['POST']],
  ['/auth/v1/verify', ['GET', 'POST']],
  ['/auth/v1/token', ['POST']],
  ['/auth/v1/user', ['GET']],
  ['/auth/v1/logout', ['POST']],
  ['/rest/v1/rpc/exam_sync', ['POST']],
]);
const FORWARDED_HEADERS = [
  'accept', 'apikey', 'authorization', 'content-type', 'x-client-info',
  'x-supabase-api-version', 'prefer', 'accept-profile', 'content-profile',
];

/**
 * The bindings the gateway reads, in standard fetch types so tests can type-check
 * it against the DOM lib. `index.ts` checks Wrangler's `Cloudflare.Env` against it.
 */
export interface GatewayEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL: string;
}

function failure(status: number, message: string): Response {
  return Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const gateway = {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${PREFIX}/`)) return env.ASSETS.fetch(request);
    const path = url.pathname.slice(PREFIX.length);
    const methods = ENDPOINTS.get(path);
    if (!methods) return failure(404, '接口不存在。');
    if (!methods.includes(request.method)) return failure(405, '不支持此请求方法。');
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return failure(403, '不允许跨站请求。');

    let upstream: URL;
    try {
      upstream = new URL(env.SUPABASE_URL);
      if (upstream.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(upstream.hostname)
        || upstream.port || upstream.username || upstream.password) throw new Error('Invalid target');
    } catch {
      return failure(503, '登录服务尚未配置，请联系站点管理员。');
    }
    upstream.pathname = path;
    upstream.search = url.search;
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // No service key is added: Supabase still verifies the caller's JWT and RLS.
    const forwarded = new Request(upstream, request);
    for (const name of [...forwarded.headers.keys()]) forwarded.headers.delete(name);
    for (const [name, value] of headers) forwarded.headers.set(name, value);
    try {
      const response = await fetch(forwarded, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('CDN-Cache-Control', 'no-store');
      responseHeaders.delete('Set-Cookie');
      responseHeaders.delete('Access-Control-Allow-Origin');
      responseHeaders.delete('Access-Control-Allow-Credentials');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    } catch {
      console.error(JSON.stringify({ event: 'supabase_gateway_unavailable', path, method: request.method }));
      return failure(502, '登录服务暂时无法连接，请稍后重试。');
    }
  },
};
