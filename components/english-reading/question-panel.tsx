'use client';

import { useEffect, useId, useLayoutEffect, useRef, type Dispatch } from 'react';
import { readingReducer, type ReadingState } from './model';
import type { ReadingQuestion } from './parts';
import styles from './reading.module.css';

type ReadingAction = Parameters<typeof readingReducer>[1];
export function ReadingQuestionPanel({ id, question, state, count, dispatch }: {
  id: string; question: ReadingQuestion; state: ReadingState; count: number; dispatch: Dispatch<ReadingAction>;
}) {
  const solutionId = useId();
  const scroll = useRef<HTMLDivElement>(null);
  const prompt = useRef<HTMLDivElement>(null);
  const solution = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const evidenceTrigger = useRef<HTMLButtonElement | null>(null);
  const previousQuestion = useRef(state.question);
  const hasAnswer = question.answer !== null && question.answer !== undefined && question.answer !== false;

  useEffect(() => {
    if (!state.revealed || !solution.current || !scroll.current) return;
    const pane = scroll.current, answer = solution.current;
    pane.scrollTo({ top: pane.scrollTop + answer.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    answer.focus({ preventScroll: true });
  }, [state.revealed]);
  useEffect(() => {
    if (state.view === 'questions') evidenceTrigger.current?.focus({ preventScroll: true });
  }, [state.view]);
  useLayoutEffect(() => {
    if (previousQuestion.current === state.question) return;
    previousQuestion.current = state.question;
    if (scroll.current) scroll.current.scrollTop = 0;
    prompt.current?.focus({ preventScroll: true });
  }, [state.question]);

  function navigate(index: number) {
    if (index < 0 || index >= count || index === state.question) return;
    evidenceTrigger.current = null;
    dispatch({ type: 'question', index, count });
  }
  function toggleSolution() {
    if (state.revealed) trigger.current?.focus({ preventScroll: true });
    dispatch({ type: 'solution', evidence: question.evidence });
  }
  return <section id={id} className={styles.questionPane} data-reading-question-pane="" aria-label="阅读理解题目"
    onKeyDown={event => { if (event.key === 'Escape' && state.revealed) { event.stopPropagation(); toggleSolution(); } }}>
    <nav className={styles.questionNav} aria-label="选择题目">
      {Array.from({ length: count }, (_, index) => <button key={index} type="button" aria-label={`第 ${index + 1} 题`}
        aria-current={state.question === index ? 'step' : undefined} onClick={() => navigate(index)}>{index + 1}</button>)}
    </nav>
    <div ref={scroll} className={styles.questionScroll} data-reading-question-scroll="" tabIndex={0} aria-label="题目与解析滚动区域">
      <section data-exam-question="" aria-label={`第 ${state.question + 1} 题`}>
        <div ref={prompt} className={styles.prompt} tabIndex={-1}>{question.prompt}</div>
        {state.revealed && <section ref={solution} id={solutionId} className={styles.solution} tabIndex={-1} aria-label={question.dialogTitle} data-reading-solution="">
          <h3>答案与解析</h3>
          {hasAnswer && <div className={styles.answer} data-reading-answer=""><span>答案</span><div>{question.answer}</div></div>}
          <div>{question.explanation}</div>
          {question.evidence.length > 0 && <div className={styles.evidenceLinks} aria-label="原文依据">
            <span>原文依据</span>
            {question.evidence.map((evidence, index) => <button key={evidence} type="button" onClick={event => {
              evidenceTrigger.current = event.currentTarget;
              dispatch({ type: 'evidence', id: evidence });
            }}>定位依据 {index + 1}</button>)}
          </div>}
        </section>}
      </section>
    </div>
    <footer className={styles.controls}>
      <button type="button" disabled={state.question === 0} onClick={() => navigate(state.question - 1)}>上一题</button>
      <div className={styles.solutionControl}>
        {hasAnswer && !state.revealed && <div className={styles.preview} data-reading-preview="">{question.answer}</div>}
        <button ref={trigger} type="button" aria-expanded={state.revealed} aria-controls={state.revealed ? solutionId : undefined} onClick={toggleSolution}>
          {state.revealed ? '收起解答' : question.buttonLabel}
        </button>
      </div>
      <button type="button" disabled={state.question === count - 1} onClick={() => navigate(state.question + 1)}>下一题</button>
    </footer>
  </section>;
}
