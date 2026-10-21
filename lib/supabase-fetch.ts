/** Keep the Supabase project URL (and session storage key) stable while routing
 * browser HTTP calls through the site's Cloudflare gateway. */
export function createSupabaseFetch(projectUrl: string, proxyUrl: string): typeof fetch {
  const project = new URL(projectUrl);
  const proxy = new URL(proxyUrl);
  return (input, init) => {
    const original = new Request(input, init);
    const url = new URL(original.url);
    if (url.origin !== project.origin) return fetch(original);
    const target = new URL(proxy);
    target.pathname = `${proxy.pathname.replace(/\/$/, '')}${url.pathname}`;
    target.search = url.search;
    return fetch(new Request(target, original));
  };
}

/** Rewrites a project URL onto the gateway; other URLs pass through unchanged. */
export function proxiedSupabaseUrl(projectUrl: string, proxyUrl: string, value: string): string {
  const project = new URL(projectUrl);
  const proxy = new URL(proxyUrl);
  const url = new URL(value);
  if (url.host !== project.host) return value;
  const target = new URL(proxy);
  target.protocol = url.protocol === 'ws:' || url.protocol === 'wss:' ? proxy.protocol.replace('http', 'ws') : proxy.protocol;
  target.pathname = `${proxy.pathname.replace(/\/$/, '')}${url.pathname}`;
  target.search = url.search;
  return target.href;
}

/** A WebSocket constructor for Realtime that connects through the same gateway. */
export function createSupabaseWebSocket(projectUrl: string, proxyUrl: string): typeof WebSocket {
  return class ProxiedWebSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(proxiedSupabaseUrl(projectUrl, proxyUrl, String(url)), protocols);
    }
  };
}
