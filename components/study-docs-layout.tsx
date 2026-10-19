'use client';

import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/docs';
import { CrawlableSidebarFolder } from './crawlable-sidebar-folder';

// Keep component overrides on the client side of the layout boundary.
// Standard docs layout: one sidebar tree of all modules, with the in-page
// table of contents shown at the top of each page on narrow screens.
export function StudyDocsLayout(props: DocsLayoutProps) {
  return (
    <DocsLayout
      {...props}
      sidebar={{ components: { Folder: CrawlableSidebarFolder } }}
    />
  );
}
