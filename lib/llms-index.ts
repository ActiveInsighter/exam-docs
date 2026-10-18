import {
  getSiteOrigin,
  toAbsoluteSiteUrl,
  toCanonicalPagePath,
  toMarkdownPath,
} from '@/lib/site-url';
import { source } from '@/lib/source';

type TreeNode = ReturnType<typeof source.getPageTree>['children'][number];

const ROOT_LABELS = new Map([
  ['408', '408'],
  ['math', '数学'],
  ['english', '英语'],
  ['politics', '政治'],
  ['programming', '编程'],
]);

function toMarkdownInline(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/([\\[\]])/g, '\\$1')
    .trim();
}

function getFolderLabel(node: Extract<TreeNode, { type: 'folder' }>) {
  const folderPath = node.$ref?.folder ?? '';
  const rootLabel = ROOT_LABELS.get(folderPath);
  if (rootLabel) return rootLabel;
  if (typeof node.name === 'string' && node.name.trim()) return toMarkdownInline(node.name);
  return toMarkdownInline(folderPath.split('/').filter(Boolean).at(-1) || '目录');
}

export function buildLLMIndex(siteOrigin = getSiteOrigin()) {
  const pages = source.getPages();
  const pageByUrl = new Map(pages.map((page) => [page.url, page] as const));
  const lines = [
    '# 考研真题与练习文档目录',
    '',
    '> 这是为 AI、搜索工具和纯文本阅读自动生成的文档索引。',
    '',
    `站点：${siteOrigin}`,
    '',
    '如果你是 AI，请优先直接打开下面的 Markdown 绝对链接读取正文，不要依赖搜索引擎重新检索站点。目录直接来自 Fumadocs 页面树，新增、删除、移动或改名文档后会在下一次构建时自动更新。',
    '',
  ];

  const markdownUrl = (url: string) => toAbsoluteSiteUrl(toMarkdownPath(url), siteOrigin);
  const browserUrl = (url: string) => toAbsoluteSiteUrl(toCanonicalPagePath(url), siteOrigin);

  function emitPage(url: string, indent = '') {
    const page = pageByUrl.get(url);
    if (!page) return;

    const title = toMarkdownInline(String(page.data.title || page.path));
    const description =
      typeof page.data.description === 'string' && page.data.description.trim().length > 0
        ? ` — ${toMarkdownInline(page.data.description)}`
        : '';

    lines.push(
      `${indent}- [${title}](${browserUrl(page.url)})${description} · [Markdown](${markdownUrl(page.url)})`,
    );
  }

  function emitNode(node: TreeNode, depth: number) {
    if (node.type === 'page') {
      emitPage(node.url);
      return;
    }

    if (node.type !== 'folder') return;

    const headingLevel = Math.min(depth, 6);
    const label = getFolderLabel(node);
    lines.push(`${'#'.repeat(headingLevel)} ${label}`, '');

    if (node.index) {
      const indexPage = pageByUrl.get(node.index.url);
      const description =
        indexPage &&
        typeof indexPage.data.description === 'string' &&
        indexPage.data.description.trim().length > 0
          ? ` — ${toMarkdownInline(indexPage.data.description)}`
          : '';
      lines.push(
        `- **目录页**：[网页](${browserUrl(node.index.url)})${description} · [Markdown](${markdownUrl(node.index.url)})`,
        '',
      );
    }

    for (const child of node.children) {
      emitNode(child, depth + 1);
    }

    lines.push('');
  }

  for (const node of source.getPageTree().children) {
    emitNode(node, 2);
  }

  lines.push(`共 ${pages.length} 篇文档。`, '');
  return lines.join('\n');
}
