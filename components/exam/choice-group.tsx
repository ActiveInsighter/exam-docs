'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toggleVariants } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import type { ChoiceDensity } from './choice-layout';
import { useChoiceReveal, useExamQuestion } from './question-state';
import { useChoiceColumns } from './use-choice-columns';

export type ChoiceOption = {
  label: string;
  content: ReactNode;
};

type Feedback =
  | 'idle'
  | 'selected'
  | 'correct'
  | 'incorrect'
  | 'missed'
  | 'answer'
  | 'dimmed';

/*
 * Columns come from --choice-cols-measured (client measurement) and fall back
 * to the server density hint through container queries.
 */
const gridClassName = cn(
  'group/choices grid w-full items-stretch gap-x-3 gap-y-2',
  'grid-cols-[repeat(var(--choice-cols-measured,var(--choice-cols,1)),minmax(0,1fr))]',
  'data-[density=compact]:@xl:[--choice-cols:4] data-[density=regular]:@xl:[--choice-cols:2]',
);

const optionClassName = cn(
  'group-data-measuring/choices:w-max group-data-measuring/choices:max-w-none group-data-measuring/choices:whitespace-nowrap',
  'transition-[background-color,box-shadow,opacity] duration-200',
);

const feedbackClassName: Record<Feedback, string> = {
  idle: '',
  selected: '',
  correct: 'bg-success/12! ring-1 ring-inset ring-success/45',
  incorrect: 'bg-destructive/10! ring-1 ring-inset ring-destructive/40',
  missed: 'bg-success/6! ring-1 ring-inset ring-success/35',
  answer: 'bg-success/10! ring-1 ring-inset ring-success/40',
  dimmed: 'opacity-55',
};

const feedbackMotion: Partial<Record<Feedback, string>> = {
  correct: 'motion-safe:animate-choice-pop',
  incorrect: 'motion-safe:animate-choice-shake',
};

const markerClassName: Record<Feedback, string> = {
  idle: 'bg-background text-muted-foreground ring-1 ring-border',
  selected: 'bg-primary text-primary-foreground ring-1 ring-primary',
  correct: 'bg-success text-success-foreground',
  incorrect: 'bg-destructive text-background',
  missed: 'border border-dashed border-success bg-background text-success',
  answer: 'bg-success text-success-foreground',
  dimmed: 'bg-background text-muted-foreground ring-1 ring-border',
};

function OptionMarker({
  label,
  feedback,
  multiple,
}: {
  label: string;
  feedback: Feedback;
  multiple: boolean;
}) {
  const icon =
    feedback === 'correct' ? (
      <CheckIcon strokeWidth={3} />
    ) : feedback === 'incorrect' ? (
      <XIcon strokeWidth={3} />
    ) : null;

  // The outer box is one content line tall (1lh of the option text), so the
  // marker stays centred on the first line for single- and multi-line options.
  return (
    <span aria-hidden="true" className="flex h-lh shrink-0 items-center self-start py-0.5 box-content">
      <span
        className={cn(
          'grid size-6 place-items-center text-xs leading-none font-medium transition-colors duration-200',
          multiple ? 'rounded-md' : 'rounded-full',
          markerClassName[feedback],
        )}
      >
        {icon ? (
          <span
            key={feedback}
            className="grid place-items-center animate-in fade-in-0 zoom-in-50 duration-300 [&_svg]:size-3.5"
          >
            {icon}
          </span>
        ) : (
          label
        )}
      </span>
    </span>
  );
}

function OptionContent({ children }: { children: ReactNode }) {
  return (
    <span className="block min-w-0 flex-1 py-0.5 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      {children}
    </span>
  );
}

function getFeedback({
  label,
  answerKey,
  selected,
  submitted,
  reveal,
  multiple,
}: {
  label: string;
  answerKey: readonly string[] | null;
  selected: readonly string[];
  submitted: boolean;
  reveal: boolean;
  multiple: boolean;
}): Feedback {
  const isSelected = selected.includes(label);
  if (!answerKey) return 'idle';

  const isKey = answerKey.includes(label);
  if (submitted) {
    if (isSelected) return isKey ? 'correct' : 'incorrect';
    if (isKey) return multiple ? 'missed' : 'answer';
    return 'dimmed';
  }
  if (reveal) return isKey ? 'answer' : 'idle';
  return isSelected ? 'selected' : 'idle';
}

/**
 * Renders the option grid. Inside a gradable question the options are toggle
 * buttons (single answer: graded on click; multiple: submitted from the status
 * bar). Elsewhere, and in the read-only dialog copy, they render statically.
 */
export function ChoiceGroup({
  options,
  density,
}: {
  options: ChoiceOption[];
  density: ChoiceDensity;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const question = useExamQuestion();
  const reveal = useChoiceReveal();
  useChoiceColumns(ref);

  const answerKey = question?.answerKey ?? null;
  const multiple = question?.multiple ?? false;
  const selected = question?.selected ?? [];
  const submitted = question?.submitted ?? false;
  const interactive = answerKey !== null && !reveal;

  const feedbackFor = (label: string) =>
    getFeedback({ label, answerKey, selected, submitted, reveal, multiple });

  const groupProps = {
    'data-density': density,
    'data-exam-choice-group': '',
  };

  if (!interactive || !question) {
    return (
      <div className="my-2 @container">
        <div ref={ref} role="list" className={gridClassName} {...groupProps}>
          {options.map((option) => {
            const feedback = feedbackFor(option.label);
            return (
              <div
                key={option.label}
                role="listitem"
                data-exam-choice-option=""
                data-feedback={feedback}
                className={cn(
                  toggleVariants({ variant: 'choice', size: 'choice' }),
                  'pointer-events-none',
                  optionClassName,
                  feedbackClassName[feedback],
                )}
              >
                <OptionMarker label={option.label} feedback={feedback} multiple={multiple} />
                <OptionContent>{option.content}</OptionContent>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 @container">
      <ToggleGroup
        ref={ref}
        multiple={multiple}
        value={[...selected]}
        onValueChange={(value) => question.select(value as string[])}
        aria-label={multiple ? '选项（多选）' : '选项'}
        variant="choice"
        size="choice"
        className={gridClassName}
        {...groupProps}
      >
        {options.map((option) => {
          const feedback = feedbackFor(option.label);
          return (
            <ToggleGroupItem
              key={option.label}
              value={option.label}
              aria-disabled={submitted || undefined}
              data-exam-choice-option=""
              data-feedback={feedback}
              className={cn(
                'cursor-pointer active:scale-[0.99]',
                submitted && 'pointer-events-none',
                optionClassName,
                feedbackClassName[feedback],
                feedbackMotion[feedback],
              )}
            >
              <OptionMarker label={option.label} feedback={feedback} multiple={multiple} />
              <OptionContent>{option.content}</OptionContent>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
