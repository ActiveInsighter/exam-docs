import './docs-typography.css';
import './exam-choice-layout.css';

import { ExamChoiceLayoutEnhancer } from '@/components/exam-choice-layout-enhancer';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import { createStudyModuleTabs } from '@/lib/study-modules';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

const moduleTabs = createStudyModuleTabs(
  source.getPages().map((page) => page.url),
);

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      tabs={moduleTabs}
    >
      <ExamChoiceLayoutEnhancer />
      {children}
    </DocsLayout>
  );
}
