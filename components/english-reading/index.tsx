import { Children, isValidElement, type ReactElement, type ComponentProps, type ReactNode } from 'react';
import { ExamArticle, hasTranslation } from './article';
import { ReadingWorkspace } from './workspace';

export { ExamArticle, Paragraph, Translation } from './article';

/**
 * Lays an article beside the shared question components without changing
 * them. The server part only validates and splits the authored children; the
 * client workspace owns the card, the split view, the translation toggle and
 * the question navigator.
 */
export function EnglishReading({ children }: { children: ReactNode }) {
  const nodes = Children.toArray(children);
  const articles = nodes.filter((node) => isValidElement(node) && node.type === ExamArticle);
  if (articles.length !== 1) throw new Error('EnglishReading requires exactly one ExamArticle.');
  const article = articles[0] as ReactElement<ComponentProps<typeof ExamArticle>>;

  return (
    <ReadingWorkspace article={article} translatable={hasTranslation(article.props)}>
      {nodes.filter((node) => node !== article)}
    </ReadingWorkspace>
  );
}
