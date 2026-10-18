import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { toAbsoluteSiteUrl, toCanonicalPagePath } from '@/lib/site-url';
import { blogSource, source } from '@/lib/source';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real `lib/source.ts` loads `.source/*` collections that need the
// fumadocs-mdx Vite plugin, which Vitest does not run. Use a small fake loader.
vi.mock('@/lib/source', () => {
  const docsPages = [
    { url: '/docs/math', path: 'math/index.mdx', data: { title: '数学', description: '数学目录' } },
    {
      url: '/docs/math/past-exams',
      path: 'math/past-exams.mdx',
      data: { title: '数学真题', description: '历年真题' },
    },
    { url: '/docs/english', path: 'english/index.mdx', data: { title: '英语', description: '英语目录' } },
  ];
  const blogPages = [
    { url: '/blog/hello', path: 'hello.mdx', data: { title: 'Hello', description: '博客' } },
  ];
  const tree = {
    name: '考研学习',
    children: [
      {
        type: 'folder',
        root: true,
        name: '数学',
        $ref: { folder: 'math' },
        index: { type: 'page', url: '/docs/math', name: '数学' },
        children: [{ type: 'page', url: '/docs/math/past-exams', name: '数学真题' }],
      },
      {
        type: 'folder',
        root: true,
        name: '英语',
        $ref: { folder: 'english' },
        index: { type: 'page', url: '/docs/english', name: '英语' },
        children: [],
      },
    ],
  };

  return {
    source: {
      getPages: () => docsPages,
      getPageTree: () => tree,
    },
    blogSource: {
      getPages: () => blogPages,
    },
  };
});

describe('crawler discovery metadata', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  });

  it('publishes every documentation page and AI entry points in the sitemap', () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    const urlSet = new Set(urls);

    expect(urlSet).toContain('https://exam.any1.tech/');
    expect(urlSet).toContain(toAbsoluteSiteUrl('/llms.txt'));
    // `/llms.mdx` is a dynamic route that the static deployment does not ship.
    expect(urls.some((url) => url.includes('/llms.mdx'))).toBe(false);

    for (const page of [...source.getPages(), ...blogSource.getPages()]) {
      expect(urlSet).toContain(toAbsoluteSiteUrl(toCanonicalPagePath(page.url)));
    }
    for (const url of urls) {
      expect(url.startsWith('https://exam.any1.tech/')).toBe(true);
    }
    for (const url of urls.filter((value) => !value.endsWith('.txt'))) {
      expect(url.endsWith('/')).toBe(true);
    }
  });

  it('allows crawling and advertises the sitemap', () => {
    const metadata = robots();
    expect(metadata.sitemap).toBe('https://exam.any1.tech/sitemap.xml');
    expect(metadata.rules).toEqual([{ userAgent: '*', allow: '/' }]);
  });
});
