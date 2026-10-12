import { Children, isValidElement, type ReactNode } from 'react';
import { ExamArticle } from './article';
import styles from './reading.module.css';

export { ExamArticle } from './article';

/** Lay out an article beside the existing question components without changing them. */
export function EnglishReading({ children }: { children: ReactNode }) {
  const nodes = Children.toArray(children);
  const articles = nodes.filter((node) => isValidElement(node) && node.type === ExamArticle);
  if (articles.length !== 1) throw new Error('EnglishReading requires exactly one ExamArticle.');
  const article = articles[0];

  return (
    <section className={styles.root} data-english-reading="" aria-label="英语阅读理解">
      <div className={styles.layout}>
        <div className={styles.articleColumn} data-reading-article="">{article}</div>
        <div className={styles.questions} data-reading-questions="">
          {nodes.filter((node) => node !== article)}
        </div>
      </div>
    </section>
  );
}
