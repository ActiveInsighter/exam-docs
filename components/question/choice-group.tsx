'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toggleVariants } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import type { ChoiceDensity } from './choice-layout';
import { useQuestionReveal, useQuestionState } from './question-state';
import { useChoiceColumns } from './use-choice-columns';

export type ChoiceOption = {
  label: string;
  /** Marker text when it differs from the label (true/false questions). */
  marker?: string;
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
  'transition-[background-color,opacity] duration-200',
);

/*
 * Flat, outline-free feedback. `!` lets the tint win over the toggle's own
 * pressed/hover fills; the marker chip carries the strong colour.
 */
const feedbackStyle: Record<Feedback, { option: string; marker: string }> = {
  idle: { option: '', marker: 'bg-background text-muted-foreground' },
  selected: { option: '', marker: 'bg-foreground text-background' },
  correct: { option: 'bg-success/12!', marker: 'bg-success text-background' },
  incorrect: { option: 'bg-destructive/10!', marker: 'bg-destructive text-background' },
  missed: { option: 'bg-success/8!', marker: 'bg-success/20 text-success' },
  answer: { option: 'bg-success/10!', marker: 'bg-success text-background' },
  dimmed: { option: 'opacity-55', marker: 'bg-background text-muted-foreground' },
};

const feedbackMotion: Partial<Record<Feedback, string>> = {
  correct: 'motion-safe:animate-choice-pop',
  incorrect: 'motion-safe:animate-choice-shake',
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

  // Latin letters borrow KaTeX's math italic so they read like variables on an
  // exam paper; other labels (对 / 错) keep the UI font.
  const letter = /^[A-Za-z]$/.test(label);

  // The outer box is one content line tall (1lh of the option text), so the
  // marker stays centred on the first line for single- and multi-line options.
  return (
    <span aria-hidden="true" className="box-content flex h-lh shrink-0 items-center self-start py-0.5">
      <span
        className={cn(
          'grid size-7 place-items-center leading-none transition-colors duration-200',
          letter
            ? 'font-[KaTeX_Math] text-[1.125rem] font-bold italic'
            : 'text-[0.8125rem] font-semibold',
          multiple ? 'rounded-[0.5rem]' : 'rounded-full',
          feedbackStyle[feedback].marker,
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
  const question = useQuestionState();
  const reveal = useQuestionReveal();
  useChoiceColumns(ref);

  const choice = question?.spec.kind === 'choice' ? question.spec : null;
  const answerKey = choice?.key ?? null;
  const multiple = choice?.multiple ?? false;
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
      <div className="my-3 @container">
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
                  feedbackStyle[feedback].option,
                )}
              >
                <OptionMarker label={option.marker ?? option.label} feedback={feedback} multiple={multiple} />
                <OptionContent>{option.content}</OptionContent>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 @container">
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
                feedbackStyle[feedback].option,
                feedbackMotion[feedback],
              )}
            >
              <OptionMarker label={option.marker ?? option.label} feedback={feedback} multiple={multiple} />
              <OptionContent>{option.content}</OptionContent>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
