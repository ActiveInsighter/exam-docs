'use client';

import { Fragment, useId, useMemo, useReducer, useState } from 'react';
import { CursorHighlight } from '../reading-motion/cursor-highlight';
import { initialReadingState, readingReducer } from './model';
import { ReadingQuestionCard } from './question-card';
import type { ReadingExercise } from './types';
import styles from './reading.module.css';

export function EnglishReadingClient({ exercise }: { exercise: ReadingExercise }) {
  const instanceId = useId();
  const [state, dispatch] = useReducer(readingReducer, initialReadingState);
  const [articlePane, setArticlePane] = useState<HTMLElement | null>(null);
  const sentences = useMemo(() => new Map(exercise.paragraphs.flatMap((paragraph, index) =>
    paragraph.map(sentence => [sentence.id, { sentence, paragraph: index + 1 }] as const))), [exercise.paragraphs]);
  const activeQuestion = exercise.questions.find(question => question.id === state.activeQuestionId);
  const activeNumber = exercise.questions.findIndex(question => question.id === state.activeQuestionId) + 1;
  const answered = Object.keys(state.choices).length;
  const reviewed = exercise.questions.filter(question => state.revealed[question.id]).length;
  const score = exercise.questions.filter(question => state.choices[question.id] === question.answer).length;
  const wordCount = exercise.paragraphs.flat().map(sentence => sentence.text).join(' ').split(/\s+/).length;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const locate = (id: string) => document.getElementById(`${instanceId}-sentence-${id}`)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'instant' : 'smooth' });
  const returnToExplanation = () => document.getElementById(`${instanceId}-${state.activeQuestionId}-explanation`)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'instant' : 'smooth' });

  return (
    <section className={`${styles.root} not-prose`} aria-label="英语阅读训练" data-english-reading="">
      <div className={styles.toolbar}>
        <div className={styles.progress} role="status">已作答 {answered}/{exercise.questions.length}<span>已查看 {reviewed}/{exercise.questions.length}</span></div>
        <button type="button" className={styles.quietButton} onClick={() => dispatch({ type: 'reset' })} disabled={!answered && !reviewed}>重新作答</button>
      </div>
      <div className={styles.layout}>
        <article ref={setArticlePane} className={styles.article} aria-label="英文文章" tabIndex={0}>
          <div className={styles.articleMeta}><span>{wordCount} words</span><span>{exercise.source}</span></div>
          <h2 className={styles.articleTitle} lang="en">{exercise.title}</h2>
          <div className={styles.passage} lang="en">
            {exercise.paragraphs.map((paragraph, paragraphIndex) => (
              <div className={styles.paragraph} key={paragraph[0].id}>
                <span className={styles.paragraphNumber} aria-label={`Paragraph ${paragraphIndex + 1}`}>{paragraphIndex + 1}</span>
                <p>{paragraph.map((sentence, index) => {
                  const evidenceIndex = activeQuestion?.evidence.indexOf(sentence.id) ?? -1;
                  const mode = evidenceIndex < 0 || evidenceIndex > state.evidenceIndex ? 'idle' : evidenceIndex < state.evidenceIndex ? 'complete' : 'playing';
                  return (
                    <Fragment key={sentence.id}>
                      {index > 0 ? ' ' : null}
                      <span id={`${instanceId}-sentence-${sentence.id}`} data-sentence-id={sentence.id}>
                        <CursorHighlight mode={mode} playKey={`${state.activeQuestionId}-${state.replay}`} scrollRoot={articlePane}
                          onComplete={() => activeQuestion && dispatch({ type: 'evidence-complete', questionId: activeQuestion.id, replay: state.replay, index: evidenceIndex, count: activeQuestion.evidence.length })}>
                          {sentence.text}
                        </CursorHighlight>
                      </span>
                    </Fragment>
                  );
                })}</p>
              </div>
            ))}
          </div>
          <div className={styles.articleFooter} aria-live="polite">
            {activeQuestion ? <><span>第 {activeNumber} 题 · {activeQuestion.evidence.length} 处原文依据</span><button type="button" className={styles.quietButton} onClick={returnToExplanation}>返回解析</button></> : <span>先阅读文章，再作答。查看解析可在原文中标出关键句。</span>}
          </div>
        </article>
        <div className={styles.questions} role="region" aria-label="阅读理解题目" tabIndex={0}>
          <div className={styles.questionsHeader}><h2>阅读理解</h2><p>选择最合适的一项，再核对答案与依据。</p></div>
          {exercise.questions.map((question, index) => <ReadingQuestionCard key={question.id} question={question} number={index + 1} instanceId={instanceId}
            state={state} dispatch={dispatch} sentences={sentences} onLocate={locate} />)}
          {reviewed === exercise.questions.length && <div className={styles.summary} role="status">本次答对 {score}/{exercise.questions.length} 题{answered < exercise.questions.length ? `，${exercise.questions.length - answered} 题未作答` : ''}。回到原文，看看每一题的依据。</div>}
        </div>
      </div>
    </section>
  );
}
