export interface StudyModuleDefinition {
  id: 'math' | '408' | 'politics' | 'english' | 'programming';
  title: string;
  description: string;
  url: string;
  routePrefixes: readonly string[];
}

export const STUDY_MODULES: readonly StudyModuleDefinition[] = [
  {
    id: 'math',
    title: '数学',
    description: '高等数学、线性代数与概率论的真题和练习资料。',
    url: '/docs/数学',
    routePrefixes: [
      '/docs/数学',
      '/docs/数学真题',
      '/docs/张宇1000题',
      '/docs/李正元练习题',
    ],
  },
  {
    id: '408',
    title: '408',
    description: '数据结构、计算机组成原理、操作系统与计算机网络。',
    url: '/docs/408',
    routePrefixes: ['/docs/408', '/docs/408模拟选择题', '/docs/408真题'],
  },
  {
    id: 'politics',
    title: '政治',
    description: '2010—2026 年思想政治理论真题、答案与解析。',
    url: '/docs/政治',
    routePrefixes: ['/docs/政治'],
  },
  {
    id: 'english',
    title: '英语',
    description: '考研英语词汇、长难句、阅读与写作资料。',
    url: '/docs/英语',
    routePrefixes: ['/docs/英语'],
  },
  {
    id: 'programming',
    title: '编程',
    description: '算法题、数据结构与编程实践。',
    url: '/docs/编程',
    routePrefixes: ['/docs/编程', '/docs/algorithm'],
  },
] as const;

function stripTrailingSlash(url: string) {
  return url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url;
}

function encodePathSegments(url: string) {
  return url
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function lowercasePercentEscapes(url: string) {
  return url.replace(/%[0-9A-F]{2}/gu, (escape) => escape.toLowerCase());
}

/**
 * Fumadocs checks custom tab URLs with Set.has(pathname), so URL matching is
 * exact and it does not decode percent-encoded Unicode pathnames first.
 *
 * Keep all pathname forms that Next/browser routing can expose. This makes
 * Chinese module routes behave the same as ASCII routes such as /docs/algorithm.
 */
export function getRouteMatchVariants(url: string) {
  const normalized = stripTrailingSlash(url);
  const encodedUri = encodeURI(normalized);
  const encodedSegments = encodePathSegments(normalized);

  return new Set([
    normalized,
    encodedUri,
    lowercasePercentEscapes(encodedUri),
    encodedSegments,
    lowercasePercentEscapes(encodedSegments),
  ]);
}

export function isStudyModulePage(
  url: string,
  module: StudyModuleDefinition,
) {
  return module.routePrefixes.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`),
  );
}

export function createStudyModuleTabs(pageUrls: readonly string[]) {
  return STUDY_MODULES.map((module) => {
    const urls = new Set<string>();

    for (const pageUrl of pageUrls) {
      if (!isStudyModulePage(pageUrl, module)) continue;

      for (const variant of getRouteMatchVariants(pageUrl)) {
        urls.add(variant);
      }
    }

    // Keep module landing pages selectable even if content generation changes.
    for (const prefix of module.routePrefixes) {
      for (const variant of getRouteMatchVariants(prefix)) {
        urls.add(variant);
      }
    }

    return {
      title: module.title,
      description: module.description,
      url: module.url,
      urls,
    };
  });
}
