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

/**
 * The sentence (or phrase) of the passage a question is answered from:
 * <Evidence for="english-reading-001">…</Evidence>. Plain text until that
 * question is graded; then 原文定位 scrolls to it and it is marked.
 */
export function Evidence({ for: questionId, children }: { for: string; children: ReactNode }) {
  return (
    <span className={styles.evidence} data-reading-evidence={questionId}>
      {children}
    </span>
  );
}

const isTranslation = (node: ReactNode): node is ReactElement<{ children: ReactNode }> =>
  isValidElement(node) && node.type === Translation;

/**
 * One numbered paragraph of the passage, optionally paired with its
 * <Translation>. A translated paragraph's number is a button that shows or
 * hides that paragraph's Chinese alone; the card's 译 switch shows them all.
 */
export function Paragraph({ children }: { children: ReactNode }) {
  const nodes = Children.toArray(children);
  const translations = nodes.filter(isTranslation);
  if (translations.length > 1) throw new Error('Paragraph accepts at most one Translation.');

  return (
    <div className={styles.paragraph} data-reading-paragraph="">
      {translations.length ? (
        <button
          type="button"
          className={styles.number}
          data-reading-paragraph-toggle=""
          aria-expanded="false"
          aria-label="本段翻译"
          title="显示或隐藏本段翻译"
        />
      ) : (
        <span className={styles.number} aria-hidden="true" />
      )}
      <div className={styles.original} data-reading-original="">{nodes.filter((node) => !isTranslation(node))}</div>
      {translations[0]}
    </div>
  );
}

/** Whether the article carries any translation, so the 译 switch is worth showing. */
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
      <header className={styles.articleHead}>
        {source ? <p className={styles.source}>{source}</p> : null}
        <h2 className={styles.title} lang="en">{title}</h2>
        {titleTranslation ? (
          <p className={styles.titleTranslation} lang="zh-CN" data-reading-translation="">{titleTranslation}</p>
        ) : null}
      </header>
      <div className={styles.passage} lang="en" data-reading-passage="">{children}</div>
    </article>
  );
}
