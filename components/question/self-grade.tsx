'use client';

import type { ComponentType } from 'react';
import { rippleButtonVariants } from '@/components/ui/ripple-button';
import { cn } from '@/lib/utils';
import { SELF_GRADES, type AttemptResult } from './grading';
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from './icons';
import { Pressable, type LiveIconProps } from './live';
import { toneButton } from './looks';
import { useQuestionState } from './question-state';

/** One animated icon per result, shared by the grade buttons and the result pill. */
export const RESULT_ICONS: Record<AttemptResult, ComponentType<LiveIconProps>> = {
  correct: CircleCheckIcon,
  partial: CircleAlertIcon,
  incorrect: CircleXIcon,
};

/**
 * An essay is graded by the reader against the reference solution: 正确,
 * 部分正确 or 错误, kept like any other answer (selected = its letter).
 * Picking another grade later records a new attempt. Each capsule takes its
 * result's tone on hover and when chosen, and ripples in it when pressed.
 */
export function SelfGrade() {
  const question = useQuestionState();
  if (question?.spec.kind !== 'self') return null;
  const picked = question.submitted ? question.selected[0] : undefined;
  return (
    <div role="group" aria-label="自评" data-self-grade="" className="inline-flex flex-wrap gap-1.5">
      {SELF_GRADES.map((grade) => {
        const Icon = RESULT_ICONS[grade.result];
        const pressed = picked === grade.letter;
        return (
          <Pressable
            key={grade.letter}
            data-tone={grade.result}
            aria-pressed={pressed}
            disabled={!question.ready}
            className={cn(rippleButtonVariants({ variant: 'outline', size: 'sm' }), toneButton, 'h-7.5 gap-1.25 rounded-full pr-3 pl-2.25 text-[0.8125rem] font-medium')}
            onClick={() => question.select([grade.letter])}
          >
            <Icon size={15} aria-hidden className="text-(--tone)" animate={pressed && question.fresh ? 'path' : false} />
            {grade.label}
          </Pressable>
        );
      })}
    </div>
  );
}
