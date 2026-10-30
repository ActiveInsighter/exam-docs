import type { source } from '@/lib/source';
import { renderStaticMarkdown } from './markdown-export.mjs';

export async function getLLMText(page: (typeof source)['$inferPage']) {
  // Processed MDX has already discarded component props such as tags/answers.
  // Use the same raw-source converter as the static .md downloads.
  return renderStaticMarkdown(await page.data.getText('raw'), {
    title: page.data.title,
    url: page.url,
  });
}
