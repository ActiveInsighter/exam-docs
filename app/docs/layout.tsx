import './docs-typography.css';
import './exam-choice-layout.css';

import { ExamChoiceLayoutEnhancer } from '@/components/exam-choice-layout-enhancer';
import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

const moduleTabGroups = [
  {
    title: '数学',
    description: '高等数学、线性代数与概率论的真题和练习资料。',
    url: '/docs/数学',
    routePrefixes: ['/docs/数学', '/docs/数学真题', '/docs/张宇1000题', '/docs/李正元练习题'],
  },
  {
    title: '408',
    description: '数据结构、计算机组成原理、操作系统与计算机网络。',
    url: '/docs/408',
    routePrefixes: ['/docs/408', '/docs/408模拟选择题', '/docs/408真题'],
  },
  {
    title: '政治',
    description: '2010—2026 年思想政治理论真题、答案与解析。',
    url: '/docs/政治',
    routePrefixes: ['/docs/政治'],
  },
  {
    title: '英语',
    description: '考研英语词汇、长难句、阅读与写作资料。',
    url: '/docs/英语',
    routePrefixes: ['/docs/英语'],
  },
  {
    title: '编程',
    description: '算法题、数据结构与编程实践。',
    url: '/docs/编程',
    routePrefixes: ['/docs/编程', '/docs/algorithm'],
  },
] as const;

function getModuleTabs() {
  const pageUrls = source.getPages().map((page) => page.url);

  return moduleTabGroups.map(({ routePrefixes, ...tab }) => ({
    ...tab,
    urls: new Set(
      pageUrls.filter((url) =>
        routePrefixes.some(
          (prefix) => url === prefix || url.startsWith(`${prefix}/`),
        ),
      ),
    ),
  }));
}

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      tabs={getModuleTabs()}
    >
      <ExamChoiceLayoutEnhancer />
      {children}
    </DocsLayout>
  );
}
