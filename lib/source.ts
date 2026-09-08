import { docs } from 'collections/dynamic';
import { blog } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import { getShortDocSlugs } from './doc-paths.mjs';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  slugs: (file) => getShortDocSlugs(file.path),
});

export const blogSource = loader({
  baseUrl: '/blog',
  source: toFumadocsSource(blog, []),
});
