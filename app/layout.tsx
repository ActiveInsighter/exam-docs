import './global.css';
import 'katex/dist/katex.css';
import './flat-ui.css';
import './study-overrides.css';
import { AppProviders } from '@/components/app-providers';
import { CrashDiagnosticsScript } from '@/components/crash-diagnostics-script';
import { FigureInkFilters } from '@/components/question/figure-ink-filters';
import { getRootMetadata, siteConfig } from '@/lib/site-config';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = getRootMetadata();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={siteConfig.lang} suppressHydrationWarning>
      <head>
        <CrashDiagnosticsScript />
      </head>
      <body className="flex min-h-screen flex-col font-sans" suppressHydrationWarning>
        <FigureInkFilters />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
