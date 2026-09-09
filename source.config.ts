import { remarkMdxMermaid, remarkStructure } from 'fumadocs-core/mdx-plugins';
import { pageSchema } from 'fumadocs-core/source/schema';
import { defineCollections, defineConfig, defineDocs } from 'fumadocs-mdx/config';
import lastModified from 'fumadocs-mdx/plugins/last-modified';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { z } from 'zod';
import { remarkExamHeadings } from './lib/remark-exam-headings';

const isStaticDocsBuild = process.env.STATIC_DOCS_BUILD === '1';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    // Fumadocs Dynamic Mode compiles each document on demand instead of feeding
    // every MD/MDX file into the bundler graph up front. This keeps Turbopack's
    // production graph bounded as the documentation corpus grows.
    dynamic: true,
    // The pure-static CDN build generates direct .md files itself, so avoid
    // generating duplicate processed Markdown during that build.
    postprocess: isStaticDocsBuild
      ? undefined
      : {
          includeProcessedMarkdown: true,
        },
    schema: pageSchema.extend({
      taskRecordId: z.string().regex(/^[a-z0-9]{15}$/u).optional(),
      messageRecordId: z.string().regex(/^[a-z0-9]{15}$/u).optional(),
      documentVersion: z.coerce.number().int().positive().max(999_999_999).optional(),
    }),
  },
});

export const blog = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: pageSchema.extend({
    date: z.coerce.date(),
    author: z.string().optional(),
  }),
});

export default defineConfig({
  plugins: [lastModified()],
  mdxOptions: {
    // Strip heading semantics from question/solution content before
    // remarkStructure sees the tree, so exercise-internal headings never leak
    // into the page TOC or create unstable sidebar jump targets.
    remarkPlugins: (plugins) => [
      remarkExamHeadings,
      ...(isStaticDocsBuild
        ? plugins.filter((plugin) => {
            const entry = Array.isArray(plugin) ? plugin[0] : plugin;
            return entry !== remarkStructure;
          })
        : plugins),
      remarkMath,
      remarkMdxMermaid,
    ],
    // Do not make production builds depend on third-party image hosts. Some
    // imported documents refer to image assets that are not in this checkout
    // yet; preserve those Markdown image nodes so adding the assets later is
    // enough to make them render, instead of failing the whole build now.
    remarkImageOptions: { external: false, onError: 'ignore' },
    // Benchmark KaTeX's HTML-only output on the isolated static-build branch.
    // KaTeX defaults to htmlAndMathml, which duplicates each formula's visual
    // HTML with an accessibility MathML tree. This experiment measures the
    // deploy-size impact; it is not a production accessibility decision.
    rehypePlugins: (plugins) => [
      [rehypeKatex, { strict: 'ignore', output: 'html' }],
      ...plugins,
    ],
  },
});
