import type {
  BaseLayoutProps,
  LinkItemType,
} from 'fumadocs-ui/layouts/shared';
import { AccountMenu } from '@/components/account';
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
  // Secondary items sit at the right edge; Fumadocs appends the GitHub icon
  // after them, so the account button lands to its left.
  {
    type: 'custom',
    secondary: true,
    children: <AccountMenu />,
  },
];
