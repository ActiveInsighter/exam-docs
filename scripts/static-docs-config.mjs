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

      // The GitHub runner exposes four logical CPUs and the latest production
      // build kept more than 14 GiB of memory free during static generation.
      // Use the available CPU budget instead of the earlier conservative cap.
      staticGenerationRetryCount: 1,
      staticGenerationMaxConcurrency: 4,
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
