'use client';

import { useId, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';
import type { ExamSolutionControlProps } from './exam-solution-control';
import type { ExamSolutionContextValue } from './exam-solution-context';
import questionStyles from './exam-question.module.css';
import triggerStyles from './exam-solution-trigger.module.css';
import styles from './exam-reading-solution.module.css';

export function ExamReadingSolution({ answer, explanation, buttonLabel, dialogTitle, evidence = [], reading }: ExamSolutionControlProps & {
  reading: ExamSolutionContextValue;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState(false);
  const expanded = reading.active?.id === id;
  const hasAnswer = answer !== null && answer !== undefined && answer !== false;
  const toggleInline = () => {
    if (expanded) { reading.close(id); return; }
    reading.open(id, evidence);
    requestAnimationFrame(() => {
      const solution = document.getElementById(`${id}-details`);
      const answerRow = solution?.querySelector('[data-reading-answer]') ?? solution;
      answerRow?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  };
  const dismiss = () => {
    reading.close(id);
    trigger.current?.focus({ preventScroll: true });
  };
  const details = <div className={styles.details}>
    <header className={styles.header}><span>解答</span><button type="button" className={styles.close} aria-label="关闭解答" onClick={dismiss}>×</button></header>
    {hasAnswer && <div className={styles.answer} data-reading-answer=""><span>答案</span><div>{answer}</div></div>}
    <div className={styles.explanation}>{explanation}</div>
    {evidence.length > 0 && <footer className={styles.footer}><span>{evidence.length} 处原文依据</span>
      <button type="button" className={triggerStyles.trigger} onClick={() => reading.wide ? reading.replay(id) : reading.showEvidence(id)}>
        {reading.wide ? '重播关键句' : '查看原文依据 ↑'}
      </button>
    </footer>}
  </div>;

  if (!reading.wide) return (
    <div className={styles.inlineActions} onKeyDown={event => {
      if (event.key === 'Escape' && expanded) { event.stopPropagation(); dismiss(); }
    }}>
      <button ref={trigger} type="button" className={`${triggerStyles.trigger} ${styles.trigger} ${styles.inlineTrigger}`} aria-expanded={expanded} aria-controls={`${id}-details`}
        onClick={toggleInline}>
        {expanded ? '收起解答' : buttonLabel}
      </button>
      {expanded && <section id={`${id}-details`} className={styles.inlineSurface} tabIndex={-1} role="region" aria-label={dialogTitle} data-exam-solution="expanded">
        {details}
      </section>}
    </div>
  );

  return (
    <div className={questionStyles.actions}>
      <Popover open={expanded || preview} modal={false} onOpenChange={(open, details) => {
        // Keep hover enabled across modes; toggling it can reopen a dismissed panel.
        if (expanded && details.reason === 'trigger-hover') { details.cancel(); return; }
        if (details.reason === 'trigger-press') {
          if (!expanded && !open) details.cancel();
          setPreview(false);
          if (expanded) reading.close(id);
          else reading.open(id, evidence);
        } else if (!open) {
          setPreview(false);
          reading.close(id);
        } else if (hasAnswer) setPreview(true);
      }}>
        <PopoverTrigger ref={trigger} className={`${questionStyles.trigger} ${triggerStyles.trigger} ${styles.trigger}`} openOnHover delay={100} closeDelay={80}
          onFocus={() => { if (hasAnswer && !expanded) setPreview(true); }}>
          {buttonLabel}
        </PopoverTrigger>
        <PopoverContent className={styles.surface} align="end" sideOffset={8} initialFocus={false} finalFocus={false}
          role={expanded ? 'dialog' : 'tooltip'} aria-label={expanded ? dialogTitle : '答案'} data-exam-solution={expanded ? 'expanded' : 'preview'}>
          {expanded ? details : <div className={styles.preview}>{answer}</div>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
