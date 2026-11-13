'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SolutionCard } from './solution-card';
import { closeSolution, finishSolutionClose, openSolution, resetSolutionPresentation, useSolutionPresentation } from './solution-presentation';

/** A single Drawer for the whole document, retained between study sessions. */
export function SolutionSheetHost() {
  const pathname = usePathname();
  const { entry, phase } = useSolutionPresentation();
  useEffect(() => resetSolutionPresentation(), [pathname]);
  if (!entry) return null;
  return <SolutionCard
    self={entry}
    open={phase === 'open'}
    setOpen={next => next ? openSolution(entry) : closeSolution()}
    onOpenChangeComplete={next => { if (!next) finishSolutionClose(); }}
  />;
}
