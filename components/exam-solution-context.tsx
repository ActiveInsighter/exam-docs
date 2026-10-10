'use client';

import { createContext, useContext } from 'react';

export interface ActiveExamSolution {
  id: string;
  evidence: readonly string[];
  index: number;
  replay: number;
}

export const ExamSolutionContext = createContext<{
  active: ActiveExamSolution | null;
  article: HTMLElement | null;
  open: (id: string, evidence: readonly string[]) => void;
  close: (id: string) => void;
  replay: (id: string) => void;
  complete: (id: string, replay: number, index: number) => void;
} | null>(null);

export const useExamSolutionContext = () => useContext(ExamSolutionContext);
