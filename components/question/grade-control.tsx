'use client';

import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from 'lucide-react';
import { ActionIcon, ActionIconContext, useActionIcon } from '@/components/ui/action-icon';
import { CircleAlertIcon as AnimatedCircleAlertIcon } from '@/components/animate-ui/icons/circle-alert';
import { CircleCheckIcon as AnimatedCircleCheckIcon } from '@/components/animate-ui/icons/circle-check';
import { CircleXIcon as AnimatedCircleXIcon } from '@/components/animate-ui/icons/circle-x';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { AttemptResult } from './grading';

const ICONS = { correct: CircleCheckIcon, partial: CircleAlertIcon, incorrect: CircleXIcon };
const ANIMATED_ICONS = {
  correct: AnimatedCircleCheckIcon,
  partial: AnimatedCircleAlertIcon,
  incorrect: AnimatedCircleXIcon,
};

/** The same result vocabulary in the footer, grading controls and solution. */
export function ResultIcon({ result, animate }: { result: AttemptResult; animate?: boolean }) {
  return (
    <ActionIcon icon={ICONS[result]} animatedIcon={ANIMATED_ICONS[result]} animate={animate} data-icon="inline-start" />
  );
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
        <GradeOption key={item.value} item={item} />
      ))}
    </ToggleGroup>
  );
}

function GradeOption({ item }: { item: GradeItem }) {
  const icon = useActionIcon();
  const { active, ...events } = icon;
  return (
    <ActionIconContext.Provider value={active}>
      <ToggleGroupItem value={item.value} data-tone={item.result} {...events}>
        <ResultIcon result={item.result} />
        {item.label}
      </ToggleGroupItem>
    </ActionIconContext.Provider>
  );
}
