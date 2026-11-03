import { baseOptions, linkItems } from '@/lib/layout.shared';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';
import '@/styles/home-layout.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions()} links={linkItems} className="study-home-layout">
      {children}
    </HomeLayout>
  );
}
