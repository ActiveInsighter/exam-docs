import { Children, isValidElement, type ReactNode } from 'react';
import { ExamArticle } from './article';
import { ReadingWorkspace } from './workspace';

export { ExamArticle } from './article';

/**
 * Lays an article beside the shared question components without changing
 * them. The server part only validates and splits the authored children; the
 * client workspace owns the card, the split view and the question navigator.
 */
export function EnglishReading({ children }: { children: ReactNode }) {
  const nodes = Children.toArray(children);
  const articles = nodes.filter((node) => isValidElement(node) && node.type === ExamArticle);
  if (articles.length !== 1) throw new Error('EnglishReading requires exactly one ExamArticle.');
  const article = articles[0];

  return (
    <ReadingWorkspace article={article}>
      {nodes.filter((node) => node !== article)}
    </ReadingWorkspace>
  );
}
