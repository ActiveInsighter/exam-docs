import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashDiagnosticsScript } from '@/components/crash-diagnostics-script';
import { diag } from '@/lib/diagnostics';

const HARMONY_UA = 'Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile HuaweiBrowser/5.0.4.300';

function scriptSource(): string {
  const markup = renderToStaticMarkup(createElement(CrashDiagnosticsScript));
  return markup.replace(/^<script>/u, '').replace(/<\/script>$/u, '');
}

/** Runs the inline script against a minimal browser and returns what it posted. */
function run(userAgent: string, search = '', storage = new Map<string, string>(), fail = false) {
  const posts: { url: string; body: { p_session: string; p_kind: string; p_events: [number, string, unknown][] } }[] = [];
  const localStorage = {
    get length() { return storage.size; },
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  const listeners = () => ({ addEventListener: () => {} });
  let heartbeat: (() => void) | undefined;
  let keypadOpen = false;
  const window: { __examDiag?: (type: string, data?: unknown, urgent?: boolean) => void } & Record<string, unknown> = {
    ...listeners(), localStorage, innerWidth: 412, innerHeight: 915, devicePixelRatio: 3, scrollY: 0,
  };
  const document = {
    ...listeners(), visibilityState: 'visible', readyState: 'loading',
    documentElement: { scrollHeight: 1000, hasAttribute: () => false },
    getElementsByTagName: () => ({ length: 10 }), querySelectorAll: () => ({ length: 0 }),
    querySelector: () => keypadOpen ? {} : null,
  };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    posts.push({ url, body: JSON.parse(String(init.body)) });
    if (fail) throw new Error('offline');
    return new Response(null, { status: 204 });
  });
  new Function('window', 'document', 'navigator', 'location', 'history', 'performance', 'fetch', 'setInterval', 'setTimeout', 'clearTimeout', 'PerformanceObserver',
    scriptSource())(
    window, document, { userAgent }, { pathname: '/docs/math/', search }, { length: 1 },
    { getEntriesByType: () => [{ type: 'reload' }] }, fetch,
    (callback: () => void) => { heartbeat = callback; return 0; }, () => 0, () => {}, undefined,
  );
  return { posts, storage, window, beat: () => heartbeat?.(), openKeypad: () => { keypadOpen = true; } };
}

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SUPABASE_PROXY_PATH', ''));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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

  it('keeps a failed previous-session upload for a later retry, then removes it after success', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const storage = new Map([
      ['exam-diag:v1:index', '["oldsession"]'],
      ['exam-diag:v1:oldsession', JSON.stringify({ sid: 'oldsession', start: Date.now() - 60_000, ev: [[0, 'boot', null]] })],
    ]);
    run(HARMONY_UA, '', storage, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storage.has('exam-diag:v1:oldsession')).toBe(true);
    run(HARMONY_UA, '', storage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storage.has('exam-diag:v1:oldsession')).toBe(false);
  });

  it('disables automatic HarmonyOS logging with an exact, persistent ?diag=0 override', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const disabled = run(HARMONY_UA, '?diag=0');
    expect(disabled.posts).toHaveLength(0);
    expect(run(HARMONY_UA, '', disabled.storage).posts).toHaveLength(0);
    expect(run(HARMONY_UA, '?diag=1', disabled.storage).posts).toHaveLength(1);
    expect(run('Chrome', '?diag=10').posts).toHaveLength(0);
  });

  it('bounds UTF-8 payload bytes, queued events, and retained local visits', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    let result = run(HARMONY_UA, '?token=sensitive');
    for (let i = 0; i < 400; i++) result.window.__examDiag?.('test', '汉'.repeat(1200));
    result.window.__examDiag?.('flush', null, true);
    for (const post of result.posts) expect(Buffer.byteLength(JSON.stringify(post.body))).toBeLessThan(30000);
    expect(JSON.stringify(result.posts)).not.toContain('sensitive');
    for (let i = 0; i < 8; i++) result = run(HARMONY_UA, '', result.storage);
    expect([...result.storage.keys()].filter((key) => key.startsWith('exam-diag:v1:') && !key.endsWith('index'))).toHaveLength(5);
  });

  it('does not let a broken diagnostics sink interrupt application code', () => {
    vi.stubGlobal('window', { __examDiag: () => { throw new Error('storage failed'); } });
    expect(() => diag('answer', { kind: 'submit' })).not.toThrow();
  });

  it('includes the mounted math keypad in its saved heartbeat', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const result = run(HARMONY_UA);
    result.openKeypad();
    result.beat();
    const record = JSON.parse(result.storage.get(`exam-diag:v1:${result.posts[0].body.p_session}`)!);
    expect(record.beat.keypad).toBe(true);
  });
});
