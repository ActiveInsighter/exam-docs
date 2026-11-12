'use client';

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BookOpenIcon } from './icons';
import { Animated, Pressable } from './live';
import { useMarks } from './marks/question-marks';
import type { QuestionMeta } from './model';
import { useQuestionState } from './question-state';
import { SolutionCard } from './solution-card';
import { removeSolutionEntry, setSolutionEntry, type SolutionEntry } from './solution-deck';

// The controller is ready with the page. Its DOM still mounts on first open,
// so one click creates one Drawer; no empty Suspense hand-off can replace it.
export function QuestionSolutionSheet({ meta, solution }: { meta: QuestionMeta; solution: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const key = useId();
  const state = useQuestionState();
  const marks = useMarks();

  const entry = useMemo<SolutionEntry>(() => ({ key, meta, solution, trigger, state, marks }), [key, meta, solution, state, marks]);
  useEffect(() => setSolutionEntry(entry), [entry]);
  useEffect(() => () => removeSolutionEntry(key), [key]);

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
          onClick={() => { setMounted(true); setOpen(true); }}
        >
          <BookOpenIcon size={15} aria-hidden />
          查看解答
        </Pressable>
      </Animated>
      {mounted ? <SolutionCard self={entry} open={open} setOpen={setOpen} /> : null}
    </>
  );
}
