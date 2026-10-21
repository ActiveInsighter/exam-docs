import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import styles from './reading.module.css';

type ArticleProps = { children: ReactNode; title: string; titleTranslation?: string; source?: string };

/** The Chinese version of one paragraph, written inside its <Paragraph>. */
export function Translation({ children }: { children: ReactNode }) {
  return (
    <div className={styles.translation} lang="zh-CN" data-reading-translation="">
      {children}
    </div>
  );
}

const isTranslation = (node: ReactNode): node is ReactElement<{ children: ReactNode }> =>
  isValidElement(node) && node.type === Translation;

/**
 * One numbered paragraph of the passage, optionally paired with its
 * <Translation>. The translation stays hidden until the reader turns on the
 * card's 翻译 toggle, then sits directly below (or beside) the English.
 */
export function Paragraph({ children }: { children: ReactNode }) {
  const nodes = Children.toArray(children);
  const translations = nodes.filter(isTranslation);
  if (translations.length > 1) throw new Error('Paragraph accepts at most one Translation.');

  return (
    <div className={styles.paragraph} data-reading-paragraph="">
      <div className={styles.original}>{nodes.filter((node) => !isTranslation(node))}</div>
      {translations[0]}
    </div>
  );
}

/** Whether the article carries any translation, so the toggle is worth showing. */
export function hasTranslation({ children, titleTranslation }: ArticleProps) {
  if (titleTranslation) return true;
  return Children.toArray(children).some((node) =>
    isValidElement<{ children?: ReactNode }>(node)
    && node.type === Paragraph
    && Children.toArray(node.props.children).some(isTranslation));
}

export function ExamArticle({ children, title, titleTranslation, source }: ArticleProps) {
  return (
    <article className={styles.article} aria-label="英文文章">
      {source && <div className={styles.source}>{source}</div>}
      <h2 className={styles.title} lang="en">{title}</h2>
      {titleTranslation && (
        <p className={styles.titleTranslation} lang="zh-CN" data-reading-translation="">{titleTranslation}</p>
      )}
      <div className={styles.passage} lang="en" data-reading-passage="">{children}</div>
    </article>
  );
}
