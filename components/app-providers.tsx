'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { AccountProvider } from '@/components/account';
import { QuestionDatabaseProvider } from '@/components/question/database-provider';
import { SearchProvider } from '@/components/search-provider';
import { diag } from '@/lib/diagnostics';

/** Temporary crash diagnostics: hydration and client-side navigations. */
function DiagnosticsMilestones() {
  const pathname = usePathname();
  useEffect(() => { diag('hydrated', { at: Math.round(performance.now()) }, true); }, []);
  useEffect(() => { diag('route', { path: pathname }); }, [pathname]);
  return null;
}

/**
 * Site-wide client providers, shared by app/layout.tsx and the static build
 * root layout. Feature modules that need cross-page state are mounted here.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    // Keep frequently used study controls quick, with one shared motion policy.
    <AnimateUIProvider tempo={0.85} reducedMotion="user">
      <AccountProvider>
        <DiagnosticsMilestones />
        {/* Answers are cached and synced site-wide, so the account menu shows them on every page. */}
        <QuestionDatabaseProvider>
          <SearchProvider>{children}</SearchProvider>
        </QuestionDatabaseProvider>
      </AccountProvider>
    </AnimateUIProvider>
  );
}
