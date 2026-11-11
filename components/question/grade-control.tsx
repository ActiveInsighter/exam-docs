'use client';

import { AnimateIcon } from '@animate-ui/react/icons';
import { CircleAlertIcon } from '@/components/animate-ui/icons/circle-alert';
import { CircleCheckIcon } from '@/components/animate-ui/icons/circle-check';
import { CircleXIcon } from '@/components/animate-ui/icons/circle-x';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { AttemptResult } from './grading';

const ICONS = { correct: CircleCheckIcon, partial: CircleAlertIcon, incorrect: CircleXIcon };

/** The same result vocabulary in the footer, grading controls and solution. */
export function ResultIcon({ result, animate = false }: { result: AttemptResult; animate?: boolean }) {
  const Icon = ICONS[result];
  return <Icon animate={animate} aria-hidden="true" data-icon="inline-start" />;
}

type GradeItem = { value: string; label: string; result: AttemptResult };
type GradeControlProps = {
  label: string;
  items: readonly GradeItem[];
  value?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

/** Controlled, required selection. Base UI owns roving focus and keyboard input. */
export function GradeControl({ label, items, value, disabled, onChange }: GradeControlProps) {
  return (
    <ToggleGroup
      render={<span />}
      aria-label={label}
      variant="grade"
      size="sm"
      spacing={1}
      className="max-w-full flex-wrap rounded-full"
      value={value ? [value] : []}
      disabled={disabled}
      onValueChange={(next) => {
        if (next[0]) onChange(next[0]);
      }}
      data-study-card-own-keys=""
    >
      {items.map((item) => (
        <AnimateIcon key={item.value} animateOnHover asChild>
          <ToggleGroupItem value={item.value} data-tone={item.result}>
            <ResultIcon result={item.result} />
            {item.label}
          </ToggleGroupItem>
        </AnimateIcon>
      ))}
    </ToggleGroup>
  );
}
