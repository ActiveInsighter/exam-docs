'use client';

import { useReducer, useState, type ReactNode } from 'react';
import { ExamSolutionContext } from '../exam-solution-context';
import { readingReducer } from './model';
import styles from './reading.module.css';

export function ReadingLayout({ article, questions }: { article: ReactNode; questions: ReactNode }) {
  const [active, dispatch] = useReducer(readingReducer, null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  return (
    <ExamSolutionContext value={{
      active, article: viewport,
      open: (id, evidence) => dispatch({ type: 'open', id, evidence }),
      close: id => dispatch({ type: 'close', id }),
      replay: id => dispatch({ type: 'replay', id }),
      complete: (id, replay, index) => dispatch({ type: 'complete', id, replay, index }),
    }}>
      <div className={styles.root} data-english-reading="">
        <div className={styles.layout}>
          <div ref={setViewport} className={styles.articleViewport} tabIndex={0}>{article}</div>
          <section className={styles.questions} aria-label="阅读理解题目">
            <h2>阅读理解</h2>
            {questions}
          </section>
        </div>
      </div>
    </ExamSolutionContext>
  );
}
