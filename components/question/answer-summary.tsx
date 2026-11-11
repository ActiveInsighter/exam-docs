'use client';

import { blur, scale, spring, useTempoTransition } from '@animate-ui/react/utils/motion';
import { MinusIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type { ComponentType, ReactNode } from 'react';
import { CheckIcon } from '@/components/animate-ui/icons/check';
import { XIcon } from '@/components/animate-ui/icons/x';
import { cn } from '@/lib/utils';
import { blankBadge } from './blank-field';
import { BlankEntry, BlankGradeSwitch, BlankKey } from './blank-grade';
import { type AttemptResult, formatKey, formatResponse, type GradingSpec } from './grading';
import { choiceLetters } from './looks';
import type { QuestionState } from './question-state';

/*
 * The answer section of the solution card: the key beside what the reader
 * submitted, as tiles in the result's tone. Blanks get a row each, with the
 * switch for grading by hand.
 */

const VERDICTS: Record<AttemptResult, { label: string; Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }> = {
  correct: { label: '正确', Icon: CheckIcon },
  partial: { label: '部分正确', Icon: MinusIcon },
  incorrect: { label: '错误', Icon: XIcon },
};

/** The plate's grey, or a result's tint in its outline. Long formulas scroll inside. */
const tile = cn(
  'flex min-w-0 flex-[1_1_10rem] flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[0.875rem] border border-(--tone-line,transparent) bg-(--tone-tint,var(--exam-plate)) px-3.5 py-3',
  '[&_small]:text-xs [&_small]:font-medium [&_small]:text-muted-foreground',
  '[&_[data-math-preview]]:max-w-full [&_[data-math-preview]]:overflow-x-auto [&_[data-math-preview]]:overflow-y-hidden [&_[data-tex-answer]]:max-w-full [&_[data-tex-answer]]:overflow-x-auto [&_[data-tex-answer]]:overflow-y-hidden',
);
const keyLabel = 'font-semibold text-(--exam-correct-ink)!';
const value = 'min-w-0 text-[1.0625rem] font-semibold wrap-anywhere';

function Tile({ tone, className, children }: { tone?: AttemptResult; className?: string; children: ReactNode }) {
  return <div data-answer-tile="" data-tone={tone} className={cn(tile, className)}>{children}</div>;
}

/** The verdict on the reader's answer: a solid disc in the result's base, popping in. */
function VerdictMark({ result }: { result: AttemptResult }) {
  const pop = useTempoTransition(spring.checkPop);
  const { label, Icon } = VERDICTS[result];
  return (
    <motion.span
      role="img"
      aria-label={label}
      data-tone={result}
      initial={{ opacity: 0, scale: scale.icon, filter: blur.icon }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={pop}
      className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-(--tone) text-(--exam-verdict-mark)"
    >
      <Icon size={12} strokeWidth={3} />
    </motion.span>
  );
}

export function AnswerSummary({ spec, state }: { spec: GradingSpec; state: QuestionState | null }) {
  const graded = state?.evaluation ? state : null;
  const letters = spec.kind === 'choice';

  if (spec.kind === 'blank') {
    // Not answered on the page: grade yourself against the key here, as with an essay.
    const gradable = graded ?? (state?.ready ? state : null);
    return (
      <ol data-answers="blank" className="m-0 grid min-w-0 list-none gap-2.5 p-0">
        {spec.blanks.map((blank, index) => {
          const verdict = graded?.evaluation?.blanks[index];
          const yours = graded?.values[index]?.trim();
          return (
            <li key={index} className="contents">
              <Tile tone={verdict && verdict !== 'correct' ? 'incorrect' : undefined}>
                {spec.blanks.length > 1 ? <small>{blankBadge(index)}</small> : null}
                <small className={keyLabel}>答案</small>
                <strong className={value}><BlankKey blank={blank} /></strong>
                {gradable ? (
                  <span className="inline-flex min-w-0 flex-auto flex-wrap items-center justify-end gap-x-2.5 gap-y-1.5 wrap-anywhere">
                    <small>{graded ? '你填' : '自评'}</small>
                    {graded ? <span className="max-w-full min-w-0">{yours ? <BlankEntry blank={blank} value={yours} /> : '—'}</span> : null}
                    <BlankGradeSwitch question={gradable} index={index} />
                  </span>
                ) : null}
              </Tile>
            </li>
          );
        })}
      </ol>
    );
  }

  const result = graded?.evaluation?.result;
  return (
    <div data-answers="" className="flex min-w-0 flex-wrap gap-2.5">
      <Tile tone="correct">
        <small className={keyLabel}>正确答案</small>
        <strong className={cn(value, letters && choiceLetters, letters && 'text-[1.375rem]')}>{formatKey(spec)}</strong>
      </Tile>
      {graded && result ? (
        <Tile tone={result === 'correct' ? undefined : result}>
          <small>你的答案</small>
          <strong className={cn(value, letters && graded.selected.length > 0 && cn(choiceLetters, 'text-[1.375rem]'))}>
            {formatResponse(spec, graded.selected, graded.values)}
          </strong>
          <VerdictMark result={result} />
        </Tile>
      ) : null}
    </div>
  );
}
