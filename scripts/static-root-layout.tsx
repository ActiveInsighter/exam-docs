import './global.css';
import 'katex/dist/katex.css';
import './surface-overrides.css';
import { SearchProvider } from '@/components/search-provider';
import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: '考研学习',
    template: '%s | 考研学习',
  },
  description: '按数学、专业课与算法练习组织的考研学习知识库。',
};

const fontVariables = {
  '--font-inter': "'Inter', 'Arial'",
  '--font-source-serif': "'Source Serif 4', Georgia",
  '--font-outfit': "'Inter', 'Arial'",
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" style={fontVariables} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans" suppressHydrationWarning>
        <SearchProvider>{children}</SearchProvider>
      </body>
    </html>
  );
}
