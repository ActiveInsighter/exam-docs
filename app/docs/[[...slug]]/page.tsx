import { getMDXComponents } from '@/components/mdx';
import { shardStaticDocParams } from '@/lib/static-doc-shards';
import { source } from '@/lib/source';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  PageLastUpdate,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';

type PageParameters = {
  params: Promise<{
    slug?: string[];
  }>;
};

export const dynamicParams = false;

function getStaticDocBuildWeight(param: { slug?: string[] }) {
  const page = source.getPage(param.slug);
  if (!page) return 1;

  try {
    return statSync(resolve(process.cwd(), 'content/docs', page.path)).size;
  } catch {
    return 1;
  }
}

export function generateStaticParams() {
  const shardCount = Number.parseInt(process.env.STATIC_DOCS_SHARD_COUNT ?? '1', 10);
  const shardIndex = Number.parseInt(process.env.STATIC_DOCS_SHARD_INDEX ?? '0', 10);
  return shardStaticDocParams(
    source.generateParams(),
    shardCount,
    shardIndex,
    getStaticDocBuildWeight,
  );
}

export default async function Page({ params }: PageParameters) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const data = await page.data.load();
  const MDX = data.body;
  const markdownUrl = `${page.url}.md`;

  return (
    <DocsPage toc={data.toc} full={page.data.full}>
      <DocsTitle className="docs-page-title font-medium">{page.data.title}</DocsTitle>
      <DocsDescription className="mb-1 font-normal">
        {page.data.description}
      </DocsDescription>
      <div id="docs-page-actions" className="flex items-center gap-2 border-b pb-6 pt-2">
        <MarkdownCopyButton
          markdownUrl={markdownUrl}
          className="docs-page-action"
        />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/ActiveInsighter/exam-docs/blob/main/content/docs/${page.path}`}
          className="docs-page-action"
        />
      </div>
      <DocsBody id="docs-body" className="pb-10 pt-4">
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      {data.lastModified && <PageLastUpdate date={data.lastModified} />}
    </DocsPage>
  );
}

export async function generateMetadata({
  params,
}: PageParameters): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
