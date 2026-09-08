import './global.css';
import 'katex/dist/katex.css';
import './surface-overrides.css';
import './study-overrides.css';
import { SearchProvider } from '@/components/search-provider';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: '考研学习',
    template: '%s | 考研学习',
  },
  description: '按数学、专业课与算法练习组织的考研学习知识库。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans" suppressHydrationWarning>
        <SearchProvider>{children}</SearchProvider>
      </body>
    </html>
  );
}
