import type { ReactNode } from 'react';
import { ReadingLayout } from './reading-layout';
import { splitReadingContent } from './parts';

export { ExamArticle } from './article';
export { ExamKeySentence } from './key-sentence';

/** Add article composition around the site's existing exam authoring structure. */
export function EnglishReading({ children }: { children: ReactNode }) {
  return <ReadingLayout {...splitReadingContent(children)} />;
}
