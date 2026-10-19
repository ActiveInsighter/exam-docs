'use client';

import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/spacious';

// Spacious layout (the one fumadocs.dev uses): `root: true` folders become the
// sidebar tab dropdown.
export function StudyDocsLayout(props: DocsLayoutProps) {
  return <DocsLayout {...props} sidebar={{ defaultOpenLevel: 0 }} />;
}
