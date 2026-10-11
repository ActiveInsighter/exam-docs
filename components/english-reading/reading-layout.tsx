'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { ExamSolutionContext } from '../exam-solution-context';
import { readingReducer } from './model';
import styles from './reading.module.css';

export function ReadingLayout({ article, questions }: { article: ReactNode; questions: ReactNode }) {
  const [active, dispatch] = useReducer(readingReducer, null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const layout = layoutRef.current!;
    // CSS owns the container breakpoint; the interaction mode follows that same layout.
    const observer = new ResizeObserver(() => setWide(getComputedStyle(layout).getPropertyValue('--reading-columns').trim() === '2'));
    observer.observe(layout);
    return () => observer.disconnect();
  }, []);

  function returnToSolution() {
    if (!active) return;
    dispatch({ type: 'return', id: active.id });
    requestAnimationFrame(() => {
      const solution = document.getElementById(`${active.id}-details`);
      solution?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      solution?.focus({ preventScroll: true });
    });
  }
  return (
    <ExamSolutionContext value={{
      active, article: viewport, wide,
      open: (id, evidence) => dispatch({ type: 'open', id, evidence }),
      close: id => dispatch({ type: 'close', id }),
      replay: id => dispatch({ type: 'replay', id }),
      showEvidence: id => dispatch({ type: 'show-evidence', id }),
      complete: (id, replay, index) => dispatch({ type: 'complete', id, replay, index }),
    }}>
      <div className={styles.root} data-english-reading="" data-reading-layout={wide ? 'columns' : 'stacked'}>
        {!wide && active?.view === 'evidence' && <nav className={styles.evidenceNav} aria-label="原文与解答导航" data-reading-evidence-nav="">
          <span>原文依据 · {Math.min(active.index + 1, active.evidence.length)}/{active.evidence.length}</span>
          <button type="button" onClick={returnToSolution}>返回解答 ↓</button>
        </nav>}
        <div ref={layoutRef} className={styles.layout}>
          <div ref={setViewport} className={styles.articleViewport} tabIndex={wide ? 0 : undefined}>{article}</div>
          <section className={styles.questions} aria-label="阅读理解题目">
            <h2>阅读理解</h2>
            {questions}
          </section>
        </div>
      </div>
    </ExamSolutionContext>
  );
}
