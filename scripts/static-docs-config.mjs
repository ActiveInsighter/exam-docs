/**
 * Configuration shared by the static documentation build and its tests.
 *
 * The regular application remains a hybrid Next.js application. This config
 * deliberately contains only features supported by Next.js static export.
 */
export function getStaticDocsConfig() {
  return {
    output: 'export',
    trailingSlash: true,
    images: {
      unoptimized: true,
    },
    experimental: {
      // Persist Turbopack compiler work across CI builds. Production build
      // filesystem caching is supported by Next 16 but remains experimental.
      turbopackFileSystemCacheForBuild: true,

      // Keep the conservative per-worker concurrency. A production A/B run on
      // the same 536-page corpus showed maxConcurrency=4 did not improve wall
      // time (288.94s vs 286.92s), so retain the lower-contention setting.
      staticGenerationRetryCount: 1,
      staticGenerationMaxConcurrency: 2,
      staticGenerationMinPagesPerWorker: 50,
    },
  };
}

const dynamicRoutePrefixes = [
  'app/api',
  'app/download',
  // The markdown route handler caused file-lock issues during static export
  // on Windows; static markdown is generated directly from `content/docs`
  // by `scripts/static-docs-markdown.mjs` instead.
  'app/llms.mdx',
];

function isWithin(childPath, ancestorPath) {
  return childPath === ancestorPath || childPath.startsWith(`${ancestorPath}/`);
}

export function shouldIncludeInStaticDocsProject(relativePath) {
  const normalizedPath = relativePath.replaceAll('\\', '/').replace(/\/+$/, '');

  return !dynamicRoutePrefixes.some((prefix) => isWithin(normalizedPath, prefix));
}
