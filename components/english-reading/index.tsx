import { Children, isValidElement, type ReactElement, type ComponentProps, type ReactNode } from 'react';
import { ExamArticle, hasTranslation } from './article';
import { ReadingWorkspace } from './workspace';

export { Evidence, ExamArticle, Paragraph, Translation } from './article';

/**
 * Pairs an article with the shared question components without changing
 * them. The server part only validates and splits the authored children; the
 * client workspace shows the article on the page with 开始答题, and opens the
 * questions beside it in a study card: one question at a time, the
 * answer-sheet strip, translation, text size, highlighter and evidence.
 */
export function EnglishReading({ children }: { children: ReactNode }) {
  const nodes = Children.toArray(children);
  const articles = nodes.filter((node) => isValidElement(node) && node.type === ExamArticle);
  if (articles.length !== 1) throw new Error('EnglishReading requires exactly one ExamArticle.');
  const article = articles[0] as ReactElement<ComponentProps<typeof ExamArticle>>;
  const questions = nodes.filter((node) => node !== article);

  return (
    <ReadingWorkspace
      article={article}
      translatable={hasTranslation(article.props)}
      storageKey={article.props.title}
      questionCount={questions.filter((node) => isValidElement(node)).length}
    >
      {questions}
    </ReadingWorkspace>
  );
}
