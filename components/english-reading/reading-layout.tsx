'use client';

import { useEffect, useId, useReducer, useRef, type ReactNode } from 'react';
import { ReadingEvidenceContext } from './evidence-context';
import { initialReadingState, readingReducer } from './model';
import type { ReadingQuestion } from './parts';
import { ReadingQuestionPanel } from './question-panel';
import styles from './reading.module.css';

export function ReadingLayout({ article, questions }: { article: ReactNode; questions: ReadingQuestion[] }) {
  const [state, dispatch] = useReducer(readingReducer, initialReadingState);
  const articlePane = useRef<HTMLDivElement>(null);
  const id = useId();
  const question = questions[state.question];

  useEffect(() => {
    const pane = articlePane.current;
    if (!pane || !pane.clientHeight || !state.evidence) return;
    const sentence = [...pane.querySelectorAll<HTMLElement>('[data-exam-key-sentence]')].find(node => node.dataset.examKeySentence === state.evidence);
    if (!sentence) return;
    const bounds = pane.getBoundingClientRect(), target = sentence.getBoundingClientRect();
    // Scroll this pane only. Opening an answer never changes document position.
    if (target.top < bounds.top + 24 || target.bottom > bounds.bottom - 24) {
      pane.scrollTo({ top: pane.scrollTop + target.top - bounds.top - 24,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [state.evidence, state.revision, state.view]);

  return <ReadingEvidenceContext value={{ ids: state.revealed ? question.evidence : [], current: state.evidence, revision: state.revision }}>
    <section className={styles.root} data-reading-workspace="" data-reading-view={state.view} aria-label="英语阅读理解">
      <div className={styles.toolbar}>
        <div className={styles.views} aria-label="阅读区域">
          <button type="button" aria-pressed={state.view === 'article'} aria-controls={`${id}-article`} onClick={() => dispatch({ type: 'view', view: 'article' })}>文章</button>
          <button type="button" aria-pressed={state.view === 'questions'} aria-controls={`${id}-questions`} onClick={() => dispatch({ type: 'view', view: 'questions' })}>题目</button>
        </div>
        <span className={styles.desktopLabel}>英语阅读理解</span>
        <span className={styles.count}>第 {state.question + 1} / {questions.length} 题</span>
        {state.view === 'article' && state.revealed && <button type="button" className={styles.return} onClick={() => dispatch({ type: 'view', view: 'questions' })}>返回题目</button>}
      </div>
      <div className={styles.layout}>
        <div ref={articlePane} id={`${id}-article`} className={styles.articlePane} data-reading-article-pane="" tabIndex={0} aria-label="文章滚动区域">{article}</div>
        <ReadingQuestionPanel id={`${id}-questions`} question={question} state={state} count={questions.length} dispatch={dispatch} />
      </div>
    </section>
  </ReadingEvidenceContext>;
}
