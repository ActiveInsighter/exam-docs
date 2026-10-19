import type { Metadata } from 'next';
import { getSiteOrigin } from './site-url';

/*
 * Site identity and repository data, shared by the root layouts (dev and the
 * static build copy), the docs layout and the page actions. Change these
 * values here instead of in components. Visual tokens live in styles/tokens.
 */
export const siteConfig = {
  name: '考研学习',
  description: '按数学、专业课与算法练习组织的考研学习知识库。',
  lang: 'zh-CN',
  locale: 'zh_CN',
  repository: {
    url: 'https://github.com/ActiveInsighter/exam-docs',
    branch: 'main',
    contentDir: 'content/docs',
  },
} as const;

/** GitHub URL of a docs page source, from its path relative to contentDir. */
export function getContentSourceUrl(pagePath: string): string {
  const { url, branch, contentDir } = siteConfig.repository;
  return `${url}/blob/${branch}/${contentDir}/${pagePath}`;
}

/** Root metadata shared by app/layout.tsx and scripts/static-root-layout.tsx. */
export function getRootMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteOrigin()),
    title: {
      default: siteConfig.name,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.description,
    openGraph: {
      type: 'website',
      locale: siteConfig.locale,
      siteName: siteConfig.name,
    },
  };
}
