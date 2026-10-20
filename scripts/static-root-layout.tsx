import './global.css';
import 'katex/dist/katex.css';
import './flat-ui.css';
import './study-overrides.css';
import { AppProviders } from '@/components/app-providers';
import { getRootMetadata, siteConfig } from '@/lib/site-config';
import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

export const metadata: Metadata = getRootMetadata();

const fontVariables = {
  '--font-inter': "'Inter', 'Arial'",
  '--font-source-serif': "'Source Serif 4', Georgia",
  '--font-outfit': "'Inter', 'Arial'",
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={siteConfig.lang} style={fontVariables} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
