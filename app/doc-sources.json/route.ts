import { getSourceTree } from '@/lib/doc-sources.server';

export const revalidate = false;
export const dynamic = 'force-static';

/**
 * The sidebar as a source tree with question counts per page. The account
 * menu and the settings page fetch it on demand to label answer records with
 * their module, folders and page; it is a static file in the CDN build.
 */
export function GET() {
  return Response.json(getSourceTree(), {
    headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
}
