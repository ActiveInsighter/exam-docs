import type { ReactNode } from 'react';
import styles from './reading.module.css';

export function ExamArticle({ children, title, source }: { children: ReactNode; title: string; source?: string }) {
  return (
    <article className={styles.article} aria-label="英文文章">
      {source && <div className={styles.source}>{source}</div>}
      <h2 lang="en">{title}</h2>
      <div className={styles.passage} lang="en">{children}</div>
    </article>
  );
}
