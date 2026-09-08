import type {
  BaseLayoutProps,
  LinkItemType,
} from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: '考研学习',
    },
    githubUrl: 'https://github.com/ActiveInsighter/exam-docs',
  };
}

export const linkItems: LinkItemType[] = [
  {
    type: 'main',
    text: '学习',
    url: '/docs/数学真题',
  },
  {
    type: 'main',
    text: 'Blog',
    url: '/blog',
  },
];
