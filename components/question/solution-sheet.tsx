'use client';

import { type ReactNode, useEffect, useId, useMemo, useRef } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BookOpenIcon } from './icons';
import { Animated, Pressable, useLive } from './live';
import { useMarks } from './marks/question-marks';
import type { QuestionMeta } from './model';
import { useQuestionState } from './question-state';
import { removeSolutionEntry, setSolutionEntry, type SolutionEntry } from './solution-deck';
import { openSolution, prepareFirstSolution, prepareSolution, useSolutionOpen } from './solution-presentation';

// Per-question triggers register data only. The shared host prepares one card.
export function QuestionSolutionSheet({ meta, solution }: { meta: QuestionMeta; solution: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const key = useId();
  const open = useSolutionOpen(key);
  const live = useLive();
  const state = useQuestionState();
  const marks = useMarks();

  const entry = useMemo<SolutionEntry>(() => ({ key, meta, solution, trigger, state, marks }), [key, meta, solution, state, marks]);
  useEffect(() => setSolutionEntry(entry), [entry]);
  useEffect(() => () => removeSolutionEntry(key), [key]);
  useEffect(() => { if (live) return prepareFirstSolution(entry); }, [live, entry]);

  return (
    <>
      <Animated animateOnHover asChild>
        <Pressable
          ref={trigger}
          data-solution-trigger=""
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'sm' }),
            'h-8 gap-1.5 rounded-full bg-(--ui-fill) px-3.5 pl-3 text-[0.8125rem] text-foreground/80 hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active)',
          )}
          onPointerEnter={event => { if (event.pointerType === 'mouse') prepareSolution(entry); }}
          onFocus={() => prepareSolution(entry)}
          onClick={() => openSolution(entry)}
        >
          <BookOpenIcon size={15} aria-hidden />
          查看解答
        </Pressable>
      </Animated>
    </>
  );
}
