'use client';

import type { ReactNode } from 'react';
import { useExamSolutionContext } from '../exam-solution-context';
import { CursorHighlight } from '../reading-motion/cursor-highlight';

export function ExamKeySentence({ id, children }: { id: string; children: ReactNode }) {
  const reading = useExamSolutionContext();
  const active = reading?.active;
  const index = active?.evidence.indexOf(id) ?? -1;
  const mode = !active || index < 0 || index > active.index ? 'idle' : index < active.index ? 'complete' : 'playing';
  return (
    <span data-exam-key-sentence={id}>
      <CursorHighlight mode={mode} playKey={active?.replay ?? 0} scrollRoot={reading?.article}
        autoScroll={reading ? reading.wide || active?.view === 'evidence' : true}
        onComplete={() => active && reading?.complete(active.id, active.replay, index)}>
        {children}
      </CursorHighlight>
    </span>
  );
}
