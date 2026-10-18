import { toAbsoluteSiteUrl } from '@/lib/site-url';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';
export const revalidate = false;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: toAbsoluteSiteUrl('/sitemap.xml'),
  };
}
