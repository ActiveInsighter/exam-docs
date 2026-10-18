const DEFAULT_SITE_ORIGIN = 'https://exam.any1.tech';

export function getSiteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
}

export function toAbsoluteSiteUrl(path: string, origin = getSiteOrigin()) {
  return new URL(path, `${origin.replace(/\/+$/, '')}/`).toString();
}

/**
 * The deployed static export uses `trailingSlash: true`, so `/docs/math`
 * answers with a redirect to `/docs/math/`. Advertise the final URL in
 * sitemaps, canonical links and llms.txt so crawlers never land on a redirect.
 */
export function toCanonicalPagePath(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

/** Static Markdown copy of a documentation page, e.g. `/docs/math.md`. */
export function toMarkdownPath(pageUrl: string) {
  return `${pageUrl.replace(/\/+$/, '')}.md`;
}
