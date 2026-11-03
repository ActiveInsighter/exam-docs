'use client';

import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IntentLink as Link } from '@/components/intent-link';
import type { TrialQuestion } from '@/lib/home/types';
import styles from './trial-sheet.module.css';

/*
 * The hero's answer sheet: one real question per subject, answered by filling
 * a box the way an exam answer sheet is filled. The first choice is graded at
 * once with a red pen, the stopwatch stops and a one-line takeaway links to
 * the full solution (查看解答) on the question's page. Nothing is saved: the reader's
 * real answer records belong to the question pages.
 */

const pad = (value: number) => String(value).padStart(2, '0');
const clock = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

function useStopwatch(resetKey: string, stopped: boolean) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);

  // Restart for every new question or retry. The static page has no clock, so
  // the browser starts it after hydration.
  useEffect(() => {
    const time = Date.now();
    setStartedAt(time);
    setNow(time);
    setStoppedAt(null);
  }, [resetKey]);

  useEffect(() => {
    if (stopped) setStoppedAt((current) => current ?? Date.now());
  }, [stopped]);

  useEffect(() => {
    if (startedAt === null || stoppedAt !== null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, stoppedAt]);

  return startedAt === null ? 0 : Math.max(0, Math.floor(((stoppedAt ?? now) - startedAt) / 1000));
}

function PenTick() {
  return (
    <svg className={styles.pen} viewBox="0 0 48 40" aria-hidden="true">
      <path pathLength={1} d="M6 22 C10 25 14 29 18 34 C24 22 32 12 44 4" />
    </svg>
  );
}

function PenCross() {
  return (
    <svg className={styles.pen} viewBox="0 0 48 40" aria-hidden="true">
      <path pathLength={1} d="M10 6 C20 16 30 26 40 35" />
      <path pathLength={1} d="M40 5 C30 15 20 26 9 35" className={styles.penSecond} />
    </svg>
  );
}

function PenCircle() {
  return (
    <svg className={styles.penCircle} viewBox="0 0 64 40" preserveAspectRatio="none" aria-hidden="true">
      <path pathLength={1} d="M40 4 C18 2 4 10 4 20 C4 32 22 37 36 36 C52 35 61 28 60 18 C59 9 48 4 30 5" />
    </svg>
  );
}

export function TrialSheet({ questions }: { questions: TrialQuestion[] }) {
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const question = questions[active] ?? questions[0];
  const answered = picked !== null;
  const correct = answered && picked === question.answer;
  const elapsed = useStopwatch(`${active}:${round}`, answered);

  const switchTo = (index: number) => {
    if (index === active) return;
    setActive(index);
    setPicked(null);
  };
  const pick = (index: number) => {
    if (!answered) setPicked(index);
  };
  const retry = () => {
    setPicked(null);
    setRound((value) => value + 1);
  };

  const optionState = (index: number) => {
    if (!answered) return 'idle';
    if (index === question.answer) return 'correct';
    return index === picked ? 'wrong' : 'idle';
  };

  return (
    <section className={styles.sheet} aria-labelledby="trial-sheet-title">
      <span className={styles.timing} aria-hidden="true" />
      <header className={styles.head}>
        <h2 id="trial-sheet-title" className={styles.heading}>
          答题卡
          <span className={styles.srOnly}>：试做一道真题</span>
        </h2>
        <div className={styles.subjects} role="group" aria-label="换一个科目">
          {questions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={styles.subject}
              aria-pressed={index === active}
              onClick={() => switchTo(index)}
            >
              <span className={styles.subjectMark} aria-hidden="true" />
              {item.subject}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.legend} aria-hidden="true">
        <span>正确填涂</span>
        <i className={styles.legendFilled} />
        <span>错误填涂</span>
        <i className={styles.legendWrong}>✓</i>
        <i className={styles.legendWrong}>✗</i>
        <i className={styles.legendWrong}>●</i>
      </div>

      <div className={styles.question} key={question.id}>
        <div className={styles.meta}>
          <span className={styles.source}>{question.source}</span>
          <span className={styles.timer}>
            用时 <time dateTime={`PT${elapsed}S`}>{clock(elapsed)}</time>
          </span>
        </div>
        <div className={styles.stem} dangerouslySetInnerHTML={{ __html: question.stemHtml }} />
        <ol className={styles.options} data-compact={question.compact ? '' : undefined}>
          {question.options.map((option, index) => (
            <li key={option.label}>
              <button
                type="button"
                className={styles.option}
                data-state={optionState(index)}
                aria-pressed={picked === index}
                aria-disabled={answered || undefined}
                onClick={() => pick(index)}
              >
                <span className={styles.optionLabel}>{option.label}.</span>
                <span dangerouslySetInnerHTML={{ __html: option.html }} />
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.answerRow}>
        <span className={styles.answerLabel}>答题区</span>
        <span className={styles.number} aria-hidden="true">
          1{answered && (correct ? <PenTick /> : <PenCross />)}
        </span>
        {/* A mouse shortcut mirroring the options above, which carry the accessible controls. */}
        <div className={styles.boxes} aria-hidden="true">
          {question.options.map((option, index) => (
            <button
              key={option.label}
              type="button"
              tabIndex={-1}
              className={styles.box}
              data-filled={picked === index ? '' : undefined}
              data-locked={answered ? '' : undefined}
              onClick={() => pick(index)}
            >
              [{option.label}]
              {answered && !correct && index === question.answer && <PenCircle />}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.feedback} aria-live="polite">
        {answered ? (
          <>
            <p className={styles.verdict} data-correct={correct ? '' : undefined}>
              {correct ? '回答正确' : `正确答案是 ${question.options[question.answer]?.label}`}
              <span>用时 {clock(elapsed)}</span>
            </p>
            <p className={styles.takeaway} dangerouslySetInnerHTML={{ __html: question.takeawayHtml }} />
            <div className={styles.feedbackActions}>
              <Link href={question.href} className={styles.solution}>
                查看完整解答
                <ArrowUpRight aria-hidden="true" />
              </Link>
              <button type="button" className={styles.retry} onClick={retry}>
                <RotateCcw aria-hidden="true" />
                重做
              </button>
            </div>
          </>
        ) : (
          <p className={styles.hint}>选一个选项，或者直接涂答题区的方框，马上判分。</p>
        )}
      </div>
    </section>
  );
}
