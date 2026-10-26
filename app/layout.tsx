import './global.css';
import 'katex/dist/katex.css';
import './flat-ui.css';
import './study-overrides.css';
import { AppProviders } from '@/components/app-providers';
import { getRootMetadata, siteConfig } from '@/lib/site-config';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = getRootMetadata();

/*
 * Ink filters for figures in questions (styles/question.css): alpha becomes
 * the darkness of each pixel and the colour one ink, so a black-on-white
 * diagram loses its white ground and sits on any surface. sRGB, so the
 * luminance weights apply to the values as stored.
 */
const INK_ALPHA = '-0.2126 -0.7152 -0.0722 0 1';

function FigureInkFilters() {
  return (
    <svg aria-hidden="true" width="0" height="0" focusable="false" style={{ position: 'absolute' }}>
      <filter id="exam-figure-ink" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${INK_ALPHA}`} />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
      <filter id="exam-figure-ink-dark" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`0 0 0 0 0.9  0 0 0 0 0.9  0 0 0 0 0.9  ${INK_ALPHA}`} />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={siteConfig.lang} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans" suppressHydrationWarning>
        <FigureInkFilters />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
