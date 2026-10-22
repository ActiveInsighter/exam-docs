import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import blake3 from 'blake3-wasm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAssetManifest,
  getAssetContentType,
  hashAsset,
  uploadAssets,
} from '../scripts/upload-cloudflare-assets.mjs';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cf-upload-'));
  mkdirSync(path.join(root, 'docs/intro'), { recursive: true });
  writeFileSync(path.join(root, 'docs/intro/index.html'), '<!doctype html><p>intro</p>');
  writeFileSync(path.join(root, 'docs/intro/__next._full.txt'), '0:{"b":"build"}');
  writeFileSync(path.join(root, 'docs/intro.md'), '# Intro');
  writeFileSync(path.join(root, '_redirects'), '/a /b 200');
  writeFileSync(path.join(root, '_headers'), '/*\n  X: y');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const jwt = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

function stubCloudflare(session: { buckets: string[][]; jwt: string }) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const result = url.endsWith('/assets-upload-session') ? session : { jwt: 'completion' };
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    }),
  );
  return calls;
}

describe('wrangler-compatible asset identity', () => {
  it('hashes the base64 body plus the file extension with BLAKE3', () => {
    const body = Buffer.from('<p>hi</p>');
    const expected = blake3.hash(`${body.toString('base64')}html`).toString('hex').slice(0, 32);
    expect(hashAsset(body, '/x/index.html')).toBe(expected);
    expect(hashAsset(body, '/x/index.html')).toHaveLength(32);
    expect(hashAsset(body, '/x/index.txt')).not.toBe(expected);
  });

  it('adds a UTF-8 charset to text types only', () => {
    expect(getAssetContentType('a/index.html')).toBe('text/html; charset=utf-8');
    expect(getAssetContentType('a/__next._full.txt')).toBe('text/plain; charset=utf-8');
    expect(getAssetContentType('a/intro.md')).toBe('text/markdown; charset=utf-8');
    expect(getAssetContentType('a/chunk.js')).toBe('text/javascript; charset=utf-8');
    expect(getAssetContentType('a/search.json')).toBe('application/json');
    expect(getAssetContentType('a/font.woff2')).toBe('font/woff2');
    expect(getAssetContentType('a/no-extension')).toBeNull();
  });

  it('builds a manifest of uploadable files with root-relative paths', async () => {
    const { manifest } = await buildAssetManifest(root);
    expect(Object.keys(manifest).sort()).toEqual([
      '/docs/intro.md',
      '/docs/intro/__next._full.txt',
      '/docs/intro/index.html',
    ]);
    expect(manifest['/docs/intro.md']).toEqual({
      hash: hashAsset(Buffer.from('# Intro'), 'intro.md'),
      size: 7,
    });
  });
});

describe('uploadAssets', () => {
  it('uploads only the buckets Cloudflare asks for, as base64 form parts', async () => {
    const { manifest } = await buildAssetManifest(root);
    const html = manifest['/docs/intro/index.html'].hash;
    const md = manifest['/docs/intro.md'].hash;
    const calls = stubCloudflare({ jwt: jwt({}), buckets: [[html], [md]] });

    const stats = await uploadAssets({
      directory: root,
      worker: 'exam-docs-preview',
      accountId: 'acct',
      apiToken: 'token',
      log: () => {},
    });

    expect(calls[0].url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct/workers/scripts/exam-docs-preview/assets-upload-session',
    );
    expect(JSON.parse(String(calls[0].init.body)).manifest).toEqual(manifest);
    const uploads = calls.slice(1);
    expect(uploads).toHaveLength(2);
    for (const upload of uploads) {
      expect(upload.url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/workers/assets/upload?base64=true');
      expect((upload.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${jwt({})}`);
    }
    // Buckets upload concurrently, so find the request that carries this hash.
    const part = uploads
      .map((upload) => (upload.init.body as FormData).get(html))
      .find((value): value is File => value instanceof File);
    if (!part) throw new Error('The HTML asset was not uploaded.');
    expect(part.type).toBe('text/html; charset=utf-8');
    expect(Buffer.from(await part.text(), 'base64').toString()).toBe('<!doctype html><p>intro</p>');
    expect(stats).toMatchObject({ fileCount: 3, uploadedFiles: 2 });
  });

  it('does nothing beyond the session when every asset is already stored', async () => {
    const calls = stubCloudflare({ jwt: jwt({}), buckets: [] });
    const stats = await uploadAssets({ directory: root, worker: 'w', accountId: 'a', apiToken: 't', log: () => {} });
    expect(calls).toHaveLength(1);
    expect(stats.uploadedFiles).toBe(0);
  });

  it('follows the single-asset upload mode announced in the session token', async () => {
    const { manifest } = await buildAssetManifest(root);
    const txt = manifest['/docs/intro/__next._full.txt'].hash;
    const token = jwt({ wrangler_single_asset_uploads: true });
    const calls = stubCloudflare({ jwt: token, buckets: [[txt]] });

    await uploadAssets({ directory: root, worker: 'w', accountId: 'a', apiToken: 't', log: () => {} });

    expect(calls[1].url).toBe(`https://api.cloudflare.com/client/v4/accounts/a/workers/assets/upload/${txt}`);
    expect((calls[1].init.headers as Record<string, string>)['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(Buffer.from(calls[1].init.body as Buffer).toString()).toBe('0:{"b":"build"}');
  });

  it('stops on a rejected request instead of retrying', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"success":false}', { status: 403 })),
    );
    await expect(
      uploadAssets({ directory: root, worker: 'w', accountId: 'a', apiToken: 't', log: () => {} }),
    ).rejects.toThrow('403');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
