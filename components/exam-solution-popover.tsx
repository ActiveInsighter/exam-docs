'use client';

import { useId, useState } from 'react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';
import type { ExamSolutionControlProps } from './exam-solution-control';
import type { useExamSolutionContext } from './exam-solution-context';
import questionStyles from './exam-question.module.css';
import triggerStyles from './exam-solution-trigger.module.css';
import styles from './exam-solution-popover.module.css';

export function ExamSolutionPopover({ answer, explanation, buttonLabel, dialogTitle, evidence = [], reading }: ExamSolutionControlProps & {
  reading: NonNullable<ReturnType<typeof useExamSolutionContext>>;
}) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  const expanded = reading.active?.id === id;
  const hasAnswer = answer !== null && answer !== undefined && answer !== false;
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
        <PopoverTrigger className={`${questionStyles.trigger} ${triggerStyles.trigger}`} openOnHover delay={100} closeDelay={80}
          onFocus={() => { if (hasAnswer && !expanded) setPreview(true); }}>
          {buttonLabel}
        </PopoverTrigger>
        <PopoverContent className={styles.surface} align="end" sideOffset={8} initialFocus={false} finalFocus={false}
          role={expanded ? 'dialog' : 'tooltip'} aria-label={expanded ? dialogTitle : '答案'} data-exam-solution={expanded ? 'expanded' : 'preview'}>
          {expanded ? <>
            <header className={styles.header}><span>解答</span><PopoverClose className={styles.close} aria-label="关闭解答">×</PopoverClose></header>
            {hasAnswer && <div className={styles.answer}><span>答案</span><div>{answer}</div></div>}
            <div className={styles.explanation}>{explanation}</div>
            {evidence.length > 0 && <footer className={styles.footer}><span>{evidence.length} 处原文依据</span>
              <button type="button" className={triggerStyles.trigger} onClick={() => reading.replay(id)}>重播关键句</button>
            </footer>}
          </> : <div className={styles.preview}>{answer}</div>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
