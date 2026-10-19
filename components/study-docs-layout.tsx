'use client';

import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/flux';
import { CrawlableSidebarFolder } from './crawlable-sidebar-folder';

// Flux layout (the one fumadocs.dev uses): `root: true` folders become the
// sidebar tab dropdown. Keep component overrides on the client side of the layout boundary.
export function StudyDocsLayout(props: DocsLayoutProps) {
  return (
    <DocsLayout
      {...props}
      sidebar={{ components: { Folder: CrawlableSidebarFolder } }}
    />
  );
}
