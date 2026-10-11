'use client';

import { createContext, useContext } from 'react';

export interface ActiveExamSolution {
  id: string;
  evidence: readonly string[];
  index: number;
  replay: number;
  view: 'solution' | 'evidence';
}

export interface ExamSolutionContextValue {
  active: ActiveExamSolution | null;
  article: HTMLElement | null;
  wide: boolean;
  open: (id: string, evidence: readonly string[]) => void;
  close: (id: string) => void;
  replay: (id: string) => void;
  showEvidence: (id: string) => void;
  complete: (id: string, replay: number, index: number) => void;
}

export const ExamSolutionContext = createContext<ExamSolutionContextValue | null>(null);

export const useExamSolutionContext = () => useContext(ExamSolutionContext);
