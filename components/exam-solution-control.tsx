'use client';

import { type ComponentProps } from 'react';
import { useExamSolutionContext } from './exam-solution-context';
import { ExamSolutionDialog } from './exam-solution-dialog';
import { ExamReadingSolution } from './exam-reading-solution';

export type ExamSolutionControlProps = ComponentProps<typeof ExamSolutionDialog> & { evidence?: readonly string[] };

/** The authoring structure stays the same; its enclosing layout selects presentation. */
export function ExamSolutionControl(props: ExamSolutionControlProps) {
  const reading = useExamSolutionContext();
  return reading ? <ExamReadingSolution {...props} reading={reading} /> : <ExamSolutionDialog {...props} />;
}
