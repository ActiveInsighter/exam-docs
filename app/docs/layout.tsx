import './docs-typography.css';

import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import { StudyDocsLayout } from '@/components/study-docs-layout';
import type { ReactNode } from 'react';
import { QuestionDatabaseProvider } from '@/components/question/database-provider';

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <QuestionDatabaseProvider>
    <StudyDocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
    >
      {children}
    </StudyDocsLayout>
    </QuestionDatabaseProvider>
  );
}
