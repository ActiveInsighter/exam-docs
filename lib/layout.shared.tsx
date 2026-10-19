import type {
  BaseLayoutProps,
  LinkItemType,
} from 'fumadocs-ui/layouts/shared';
import { siteConfig } from './site-config';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: siteConfig.name,
    },
    githubUrl: siteConfig.repository.url,
  };
}

export const linkItems: LinkItemType[] = [
  {
    type: 'main',
    text: '学习',
    url: '/docs/math',
  },
  {
    type: 'main',
    text: 'Blog',
    url: '/blog',
  },
];
