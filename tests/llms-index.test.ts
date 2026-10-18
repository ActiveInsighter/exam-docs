import { buildLLMIndex } from '@/lib/llms-index';
import { toAbsoluteSiteUrl, toCanonicalPagePath, toMarkdownPath } from '@/lib/site-url';
import { source } from '@/lib/source';
import { describe, expect, it, vi } from 'vitest';

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
      getPages: () => [],
    },
  };
});

describe('LLM documentation index', () => {
  it('lists the documentation tree with absolute browser and Markdown links', () => {
    const origin = 'https://exam.any1.tech';
    const index = buildLLMIndex(origin);
    const pages = source.getPages();

    expect(index).toContain('# 考研真题与练习文档目录');
    expect(index).toContain('## 数学');
    expect(index).toContain('## 英语');
    expect(index).toContain('- [数学真题](https://exam.any1.tech/docs/math/past-exams/)');
    expect(index).toContain('不要依赖搜索引擎重新检索站点');

    for (const page of pages) {
      const browserUrl = toAbsoluteSiteUrl(toCanonicalPagePath(page.url), origin);
      const markdownUrl = toAbsoluteSiteUrl(toMarkdownPath(page.url), origin);
      expect(index).toContain(`](${browserUrl})`);
      expect(index).toContain(`[Markdown](${markdownUrl})`);
    }

    expect(index).toContain('](https://exam.any1.tech/docs/math/)');
    expect(index).toContain('[Markdown](https://exam.any1.tech/docs/math.md)');
    expect(index).not.toContain('](/docs/');
    expect(index).not.toContain('/llms.mdx/');
    expect(index).toContain(`共 ${pages.length} 篇文档。`);
  });
});
