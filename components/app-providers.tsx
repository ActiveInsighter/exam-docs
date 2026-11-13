'use client';

import type { ReactNode } from 'react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { ReducedMotionConfig } from '@animate-ui/react/utils/motion';
import { AccountProvider } from '@/components/account';
import { QuestionDatabaseProvider } from '@/components/question/database-provider';
import { SolutionSheetHost } from '@/components/question/solution-sheet-host';
import { SearchProvider } from '@/components/search-provider';

/**
 * Site-wide client providers, shared by app/layout.tsx and the static build
 * root layout. Feature modules that need cross-page state are mounted here.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    // Keep frequently used study controls quick, with one shared motion policy.
    <AnimateUIProvider tempo={0.85} reducedMotion="user">
      <ReducedMotionConfig>
        <AccountProvider>
          {/* Answers are cached and synced site-wide, so the account menu shows them on every page. */}
          <QuestionDatabaseProvider>
            <SearchProvider>{children}<SolutionSheetHost /></SearchProvider>
          </QuestionDatabaseProvider>
        </AccountProvider>
      </ReducedMotionConfig>
    </AnimateUIProvider>
  );
}
