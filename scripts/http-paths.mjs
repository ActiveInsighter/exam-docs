/**
 * Encode a URL path for an HTTP client while preserving path separators.
 *
 * Local build paths may contain Unicode characters, but command-line HTTP
 * clients must receive their percent-encoded URL representation. Encoding
 * each segment also prevents reserved characters in a filename from changing
 * the request's path/query/fragment boundaries.
 */
export function encodeHttpPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) {
    throw new Error(`Expected an absolute URL path, got ${JSON.stringify(pathname)}.`);
  }

  return pathname
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
