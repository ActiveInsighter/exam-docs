import type { Dispatch } from 'react';
import type { ReadingAction, ReadingState } from './model';
import type { ReadingQuestion, ReadingSentence } from './types';
import styles from './reading.module.css';

export function ReadingQuestionCard({ question, number, instanceId, state, dispatch, sentences, onLocate }: {
  question: ReadingQuestion;
  number: number;
  instanceId: string;
  state: ReadingState;
  dispatch: Dispatch<ReadingAction>;
  sentences: Map<string, { sentence: ReadingSentence; paragraph: number }>;
  onLocate: (id: string) => void;
}) {
  const selected = state.choices[question.id];
  const revealed = !!state.revealed[question.id];
  const expanded = state.activeQuestionId === question.id;
  const prefix = `${instanceId}-${question.id}`;
  const chosenOption = question.options.find(option => option.id === selected);

  return (
    <section className={styles.question} data-question-id={question.id} data-expanded={expanded}>
      <div className={styles.questionMeta}><span>第 {number} 题</span><span>{question.skill}</span></div>
      <fieldset className={styles.choices}>
        <legend lang="en">{question.prompt}</legend>
        {question.options.map(option => {
          const correct = revealed && option.id === question.answer;
          const wrong = revealed && selected === option.id && !correct;
          return (
            <label key={option.id} className={styles.option} data-selected={selected === option.id} data-correct={correct} data-wrong={wrong}>
              <input type="radio" name={prefix} value={option.id} checked={selected === option.id} disabled={revealed}
                onChange={() => dispatch({ type: 'choose', questionId: question.id, optionId: option.id })} />
              <span className={styles.optionLetter} aria-hidden="true">{option.id}</span>
              <span lang="en"><span className={styles.srOnly}>{option.id}. </span>{option.text}</span>
              {correct && <span className={styles.optionResult}>正确</span>}
              {wrong && <span className={styles.optionResult}>你的选择</span>}
            </label>
          );
        })}
      </fieldset>
      <div className={styles.actions}>
        <button type="button" className={styles.quietButton} aria-expanded={revealed} aria-controls={`${prefix}-answer`}
          onClick={() => dispatch({ type: 'answer', questionId: question.id })}>{revealed ? '收起答案' : '查看答案'}</button>
        <button type="button" className={styles.explainButton} aria-expanded={expanded} aria-controls={`${prefix}-explanation`}
          onClick={() => dispatch({ type: 'explanation', questionId: question.id })}>{expanded ? '收起解析' : '查看解析'}</button>
      </div>
      <div id={`${prefix}-answer`} hidden={!revealed} className={styles.answer} role="status">
        {revealed && <><strong>正确答案 {question.answer}</strong><span>{selected ? selected === question.answer ? '答对了' : `你的选择 ${selected}` : '尚未作答'}</span></>}
      </div>
      <div id={`${prefix}-explanation`} hidden={!expanded} className={styles.explanation}>
        {expanded && <>
          <p>{question.explanation}</p>
          {chosenOption && selected !== question.answer && <p className={styles.distractor}><strong>为什么不选 {selected}？</strong>{chosenOption.explanation}</p>}
          <div className={styles.evidenceHeader}>
            <strong>原文依据</strong>
            <button type="button" className={styles.quietButton} onClick={() => dispatch({ type: 'replay' })}>重播关键句</button>
          </div>
          {question.evidence.map((id, index) => {
            const item = sentences.get(id)!;
            return (
              <div className={styles.evidence} key={id}>
                <button type="button" className={styles.evidenceLink} onClick={() => onLocate(id)}>第 {item.paragraph} 段 · 依据 {index + 1}<span>定位原文</span></button>
                <blockquote lang="en">{item.sentence.text}</blockquote>
              </div>
            );
          })}
        </>}
      </div>
    </section>
  );
}
