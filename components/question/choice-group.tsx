'use client';

import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import type { ChoiceDensity } from './choice-layout';
import { useQuestionState } from './question-state';
import { useChoiceColumns } from './use-choice-columns';

export type ChoiceOption = {
  label: string;
  content: ReactNode;
};

/**
 * idle · selected (picked, not graded) · correct / incorrect (picked, graded) ·
 * missed (a key option left out of a multiple answer: 漏选) ·
 * answer (the key of a single answer the reader missed) · dimmed (not involved).
 */
export type ChoiceFeedback = 'idle' | 'selected' | 'correct' | 'incorrect' | 'missed' | 'answer' | 'dimmed';

export function getChoiceFeedback({
  label,
  answerKey,
  selected,
  submitted,
  multiple,
}: {
  label: string;
  answerKey: readonly string[] | null;
  selected: readonly string[];
  submitted: boolean;
  multiple: boolean;
}): ChoiceFeedback {
  const isSelected = selected.includes(label);
  if (!answerKey) return 'idle';
  const isKey = answerKey.includes(label);
  if (submitted) {
    if (isSelected) return isKey ? 'correct' : 'incorrect';
    if (isKey) return multiple ? 'missed' : 'answer';
    return 'dimmed';
  }
  return isSelected ? 'selected' : 'idle';
}

const NOTES: Partial<Record<ChoiceFeedback, string>> = { missed: '漏选', answer: '正确答案' };

/** The letter in its ring; feedback icons and the tick are CSS pseudo-elements. */
function Marker({ label }: { label: string }) {
  return (
    <span data-choice-marker="" aria-hidden="true">
      <span data-choice-letter="">{label}</span>
    </span>
  );
}

function OptionBody({ option, feedback }: { option: ChoiceOption; feedback: ChoiceFeedback }) {
  const note = NOTES[feedback];
  return (
    <>
      <Marker label={option.label} />
      <span data-choice-content="">{option.content}</span>
      {note ? <span data-choice-note="">{note}</span> : null}
    </>
  );
}

/** Arrow keys move between options; Home / End jump to the ends. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-exam-choice-option]'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index === -1) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

/**
 * The option grid. Inside a gradable question the options are buttons
 * (single answer: graded on click; multiple: submitted from the footer);
 * otherwise they render as a static list.
 */
export function ChoiceGroup({ options, density }: { options: ChoiceOption[]; density: ChoiceDensity }) {
  const ref = useRef<HTMLDivElement>(null);
  const question = useQuestionState();
  useChoiceColumns(ref);

  const spec = question?.spec.kind === 'choice' ? question.spec : null;
  const multiple = spec?.multiple ?? false;

  if (!question || !spec) {
    return (
      <div ref={ref} role="list" data-exam-choice-group="" data-density={density}>
        {options.map((option) => (
          <div key={option.label} role="listitem" data-exam-choice-option="" data-option-label={option.label} data-feedback="idle">
            <OptionBody option={option} feedback="idle" />
          </div>
        ))}
      </div>
    );
  }

  const { selected, submitted, ready, fresh } = question;
  const toggle = (label: string) => {
    if (!multiple) question.select([label]);
    else question.select(selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label]);
  };
  // Radio pattern: one tab stop, on the picked option or the first.
  const tabStop = multiple ? null : (selected[0] ?? options[0]?.label);

  return (
    <div
      ref={ref}
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={multiple ? '选项（可多选）' : '选项'}
      data-exam-choice-group=""
      data-density={density}
      data-multiple={multiple ? '' : undefined}
      onKeyDown={moveFocus}
    >
      {options.map((option) => {
        const feedback = getChoiceFeedback({ label: option.label, answerKey: spec.key, selected, submitted, multiple });
        const locked = submitted || !ready;
        return (
          <button
            key={option.label}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={selected.includes(option.label)}
            aria-disabled={locked || undefined}
            tabIndex={tabStop === null || tabStop === option.label ? 0 : -1}
            data-exam-choice-option=""
            data-option-label={option.label}
            data-feedback={feedback}
            data-fresh={fresh ? '' : undefined}
            onClick={() => { if (!locked) toggle(option.label); }}
          >
            <OptionBody option={option} feedback={feedback} />
          </button>
        );
      })}
    </div>
  );
}
