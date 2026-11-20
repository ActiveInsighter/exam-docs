import { renderAndroidMarkdown } from '@/lib/markdown-export.mjs';
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const tail = slug.at(-1);
  if (!tail?.endsWith('.md')) notFound();

  const route = [...slug.slice(0, -1), tail.slice(0, -3)];
  if (route[0] !== 'docs') notFound();
  const page = source.getPage(route.slice(1));
  if (!page) notFound();

  return new Response(renderAndroidMarkdown(await page.data.getText('raw'), { title: page.data.title }), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
