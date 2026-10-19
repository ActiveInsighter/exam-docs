'use client';

import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/notebook';
import { CrawlableSidebarFolder } from './crawlable-sidebar-folder';

// Keep component overrides on the client side of the layout boundary.
export function StudyDocsLayout({ nav, ...props }: DocsLayoutProps) {
  return (
    <DocsLayout
      {...props}
      nav={{ ...nav, mode: 'top' }}
      tabMode="navbar"
      sidebar={{ components: { Folder: CrawlableSidebarFolder } }}
    />
  );
}
