import { createHash } from 'node:crypto';

const MAX_ROUTE_SLUG_LENGTH = 150;
const SAFE_SOURCE_SEGMENT = /^[A-Za-z0-9._~-]+$/u;

function normalizeSourcePath(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

function getSourceSegments(relativePath) {
  const normalized = normalizeSourcePath(relativePath).replace(/\.(md|mdx)$/iu, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.at(-1)?.toLowerCase() === 'index') segments.pop();
  return segments;
}

function compactSegment(segment) {
  const prefix =
    segment.match(/^\d{1,3}/u)?.[0] ??
    segment.match(/^[A-Za-z][A-Za-z0-9]{0,11}/u)?.[0] ??
    's';
  const digest = createHash('sha1').update(segment).digest('hex').slice(0, 8);
  return `${prefix}-${digest}`;
}

/**
 * Generate deterministic, Windows-safe route slugs without changing source
 * filenames. Short ASCII paths stay readable; long or non-ASCII nested
 * segments retain a numeric/ASCII hint plus a stable hash.
 */
export function getShortDocSlugs(relativePath) {
  const sourceSegments = getSourceSegments(relativePath);
  const slugs = sourceSegments.map((segment, index) => {
    if (index === 0 || (SAFE_SOURCE_SEGMENT.test(segment) && segment.length <= 40)) {
      return encodeURI(segment);
    }
    return compactSegment(segment);
  });

  for (
    let index = slugs.length - 1;
    index >= 0 && slugs.join('/').length > MAX_ROUTE_SLUG_LENGTH;
    index -= 1
  ) {
    slugs[index] = compactSegment(sourceSegments[index]);
  }

  return slugs;
}

export function getShortDocSlugPath(relativePath) {
  return getShortDocSlugs(relativePath).join('/');
}
