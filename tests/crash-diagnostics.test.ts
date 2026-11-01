import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrashDiagnosticsScript } from '@/components/crash-diagnostics-script';

const HARMONY_UA = 'Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile HuaweiBrowser/5.0.4.300';

function scriptSource(): string {
  const markup = renderToStaticMarkup(createElement(CrashDiagnosticsScript));
  return markup.replace(/^<script>/u, '').replace(/<\/script>$/u, '');
}

/** Runs the inline script against a minimal browser and returns what it posted. */
function run(userAgent: string, search = '', storage = new Map<string, string>()) {
  const posts: { url: string; body: { p_session: string; p_kind: string; p_events: [number, string, unknown][] } }[] = [];
  const localStorage = {
    get length() { return storage.size; },
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  const listeners = () => ({ addEventListener: () => {} });
  const window = { ...listeners(), localStorage, innerWidth: 412, innerHeight: 915, devicePixelRatio: 3, scrollY: 0 };
  const document = {
    ...listeners(), visibilityState: 'visible', readyState: 'loading',
    documentElement: { scrollHeight: 1000, hasAttribute: () => false },
    getElementsByTagName: () => ({ length: 10 }), querySelectorAll: () => ({ length: 0 }),
  };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    posts.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(null, { status: 204 });
  });
  new Function('window', 'document', 'navigator', 'location', 'history', 'performance', 'fetch', 'setInterval', 'setTimeout', 'clearTimeout', 'PerformanceObserver',
    scriptSource())(
    window, document, { userAgent }, { pathname: '/docs/math/', search }, { length: 1 },
    { getEntriesByType: () => [{ type: 'reload' }] }, fetch, () => 0, () => 0, () => {}, undefined,
  );
  return { posts, storage };
}

afterEach(() => vi.unstubAllEnvs());

describe('temporary crash diagnostics', () => {
  it('renders nothing without a configured cloud project', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(renderToStaticMarkup(createElement(CrashDiagnosticsScript))).toBe('');
  });

  it('reports a HarmonyOS visit through the same-origin gateway and resends a visit the browser cut off', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://hqtpzhefihdwllbqjeot.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PROXY_PATH', '/api/supabase');

    const first = run(HARMONY_UA);
    expect(first.posts).toHaveLength(1);
    expect(first.posts[0].url).toBe('/api/supabase/rest/v1/rpc/exam_client_log');
    expect(first.posts[0].body.p_kind).toBe('live');
    expect(first.posts[0].body.p_events[0][1]).toBe('boot');
    expect(first.posts[0].body.p_events[0][2]).toMatchObject({ nav: 'reload', vw: 412, dpr: 3 });

    // The first visit never reached pagehide; the next one sends its trail as 'previous'.
    const [record] = [...first.storage.entries()].filter(([key]) => key.startsWith('exam-diag:v1:') && !key.endsWith('index'));
    first.storage.set(record[0], JSON.stringify({ ...JSON.parse(record[1]), start: Date.now() - 60_000 }));
    const second = run(HARMONY_UA, '', first.storage);
    const previous = second.posts.find((post) => post.body.p_kind === 'previous');
    expect(previous?.body.p_session).toBe(first.posts[0].body.p_session);
    expect(previous?.body.p_events[0][1]).toBe('cut-off');
    expect(previous?.body.p_events.some(([, type]) => type === 'boot')).toBe(true);
  });

  it('stays off in other browsers unless ?diag=1 asks for it', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://hqtpzhefihdwllbqjeot.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const chrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
    expect(run(chrome).posts).toHaveLength(0);
    const forced = run(chrome, '?diag=1');
    expect(forced.posts).toHaveLength(1);
    expect(forced.posts[0].url).toBe('https://hqtpzhefihdwllbqjeot.supabase.co/rest/v1/rpc/exam_client_log');
    expect(run(chrome, '?diag=0', forced.storage).posts).toHaveLength(0);
  });

  it('is mounted first in the head of both root layouts', () => {
    for (const layout of ['app/layout.tsx', 'scripts/static-root-layout.tsx']) {
      expect(readFileSync(layout, 'utf8'), layout).toMatch(/<head>\s*<CrashDiagnosticsScript \/>/u);
    }
  });
});
