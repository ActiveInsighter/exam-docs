import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSourceTree, countQuestionsInMdx, normalizeDocPath, type PageTreeLike, type SourceTree } from './doc-sources';
import { source } from './source';

let cached: SourceTree | undefined;

/**
 * The sidebar as a source tree, with the number of questions on every page
 * (read from the MDX files, so no page has to be compiled). Built once per
 * server process; the static export embeds it in the settings page.
 */
export function getSourceTree(): SourceTree {
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const page of source.getPages()) {
    let questions = 0;
    try {
      questions = countQuestionsInMdx(readFileSync(resolve(process.cwd(), 'content/docs', page.path), 'utf8'));
    } catch { /* a virtual page has no file: no questions */ }
    counts.set(normalizeDocPath(page.url), questions);
  }
  cached = buildSourceTree(source.getPageTree() as PageTreeLike, (url) => counts.get(url) ?? 0);
  return cached;
}
