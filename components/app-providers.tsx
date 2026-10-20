'use client';

import type { ReactNode } from 'react';
import { AccountProvider } from '@/components/account';
import { SearchProvider } from '@/components/search-provider';

/**
 * Site-wide client providers, shared by app/layout.tsx and the static build
 * root layout. Feature modules that need cross-page state are mounted here.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <SearchProvider>{children}</SearchProvider>
    </AccountProvider>
  );
}
