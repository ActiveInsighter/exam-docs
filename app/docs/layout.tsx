import './docs-typography.css';
import './exam-choice-layout.css';

import { CrawlableSidebarFolder } from '@/components/crawlable-sidebar-folder';
import { ExamChoiceLayoutEnhancer } from '@/components/exam-choice-layout-enhancer';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      sidebar={{ components: { Folder: CrawlableSidebarFolder } }}
    >
      <ExamChoiceLayoutEnhancer />
      {children}
    </DocsLayout>
  );
}
