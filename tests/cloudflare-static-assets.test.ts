import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The deployment helper is intentionally a Node.js ESM script.
import {
  buildCloudflareAssetsIgnore,
  buildCloudflareRedirects,
  CLOUDFLARE_DYNAMIC_REDIRECT_LIMIT,
} from '../scripts/prepare-cloudflare-static-assets.mjs';

describe('Cloudflare Workers Static Assets deployment', () => {
  it('uses an assets-only SSG configuration with canonical trailing-slash handling', () => {
    const config = JSON.parse(readFileSync(resolve('wrangler.jsonc'), 'utf8'));

    expect(config.name).toBe('exam-docs');
    expect(config.main).toBeUndefined();
    expect(config.workers_dev).toBe(true);
    expect(config.assets).toEqual({
      directory: './.static-docs',
      not_found_handling: '404-page',
      html_handling: 'auto-trailing-slash',
    });
  });

  it('translates guarded EdgeOne RSC rewrites to Cloudflare 200 proxy rules', () => {
    const redirects = buildCloudflareRedirects([
      {
        source: '/docs/*/index.txt',
        destination: '/docs/:splat/__next._full.txt',
      },
      {
        source: '/docs/*/__next.docs.txt',
        destination: '/docs/__next.docs.txt',
      },
    ]);

    expect(redirects).toContain('/docs/*/index.txt /docs/:splat/__next._full.txt 200');
    expect(redirects).toContain('/docs/*/__next.docs.txt /docs/__next.docs.txt 200');
  });

  it('keeps Cloudflare dynamic redirects within the documented limit', () => {
    expect(CLOUDFLARE_DYNAMIC_REDIRECT_LIMIT).toBe(100);
    const tooMany = Array.from({ length: 101 }, (_, index) => ({
      source: `/docs/path-${index}/*`,
      destination: `/docs/path-${index}/:splat`,
    }));

    expect(() => buildCloudflareRedirects(tooMany)).toThrow(/at most 100 dynamic/);
  });

  it('refuses unsupported multi-splat or external proxy rewrites', () => {
    expect(() =>
      buildCloudflareRedirects([
        { source: '/docs/*/nested/*', destination: '/docs/:splat' },
      ]),
    ).toThrow(/only one splat/);

    expect(() =>
      buildCloudflareRedirects([
        { source: '/docs/*', destination: 'https://example.com/:splat' },
      ]),
    ).toThrow(/stay on-site/);
  });

  it('excludes EdgeOne deployment metadata from Cloudflare asset upload', () => {
    expect(buildCloudflareAssetsIgnore()).toContain('\nedgeone.json\n');
  });
});
