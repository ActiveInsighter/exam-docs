'use client';

import type { ReactNode } from 'react';
import { AccountProvider } from '@/components/account';
import { QuestionDatabaseProvider } from '@/components/question/database-provider';
import { SearchProvider } from '@/components/search-provider';

/**
 * Site-wide client providers, shared by app/layout.tsx and the static build
 * root layout. Feature modules that need cross-page state are mounted here.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      {/* Answers are cached and synced site-wide, so the account menu shows them on every page. */}
      <QuestionDatabaseProvider>
        <SearchProvider>{children}</SearchProvider>
      </QuestionDatabaseProvider>
    </AccountProvider>
  );
}
