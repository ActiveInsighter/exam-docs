'use client';

import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/docs';
import { CrawlableSidebarFolder } from './crawlable-sidebar-folder';

// Standard Fumadocs docs layout: left sidebar, right table of contents, and
// `root: true` folders as the sidebar tab dropdown. Keep component overrides
// on the client side of the layout boundary.
export function StudyDocsLayout(props: DocsLayoutProps) {
  return (
    <DocsLayout
      {...props}
      sidebar={{ components: { Folder: CrawlableSidebarFolder } }}
    />
  );
}
