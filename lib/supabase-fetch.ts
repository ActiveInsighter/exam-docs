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
