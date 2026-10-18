import { toAbsoluteSiteUrl, toCanonicalPagePath } from '@/lib/site-url';
import { blogSource, source } from '@/lib/source';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';
export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: toAbsoluteSiteUrl(toCanonicalPagePath(page.url)),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const posts: MetadataRoute.Sitemap = blogSource.getPages().map((post) => ({
    url: toAbsoluteSiteUrl(toCanonicalPagePath(post.url)),
    changeFrequency: 'monthly',
    priority: 0.4,
  }));

  return [
    {
      url: toAbsoluteSiteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: toAbsoluteSiteUrl('/llms.txt'),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: toAbsoluteSiteUrl('/blog/'),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    ...pages,
    ...posts,
  ];
}
