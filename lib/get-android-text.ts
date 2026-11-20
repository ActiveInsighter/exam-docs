import type { source } from '@/lib/source';
import { renderAndroidMarkdown } from './markdown-export.mjs';

export async function getAndroidText(page: (typeof source)['$inferPage']) {
  return renderAndroidMarkdown(await page.data.getText('raw'), {
    title: page.data.title,
    url: page.url,
  });
}
