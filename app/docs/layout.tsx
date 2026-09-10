import './docs-typography.css';
import './exam-choice-layout.css';

import { ExamChoiceLayoutEnhancer } from '@/components/exam-choice-layout-enhancer';
import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      <ExamChoiceLayoutEnhancer />
      {children}
    </DocsLayout>
  );
}
