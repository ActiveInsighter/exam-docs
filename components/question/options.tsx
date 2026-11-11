'use client';

import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { CheckIcon } from '@/components/animate-ui/icons/check';
import { XIcon } from '@/components/animate-ui/icons/x';
import { buttonVariants } from '@/components/ui/button';
import { RippleButton } from '@/components/ui/ripple-button';
import type { ChoiceDensity } from './choice-layout';
import { BOOLEAN_FALSE, BOOLEAN_TRUE, keyLetters, optionFeedback, type OptionFeedback } from './grading';
import { useQuestionState } from './question-state';
import { useChoiceColumns } from './use-choice-columns';

/*
 * The answer options of single, multiple and true / false questions. All
 * three use the shared Animate UI RippleButton, picked by letter. A boolean is
 * a single choice between A = 正确 and B = 错误, so one group drives both
 * looks. Official ripples provide press feedback; the persistent state is
 * after grading is `data-feedback` (grading.ts), styled in
 * styles/question/options.css.
 */

export type ChoiceOption = {
  /** Stable key used for selection and grading (A, B, …). */
  label: string;
  content: ReactNode;
};

/** A key option the reader did not pick says why it is marked, on a tab at its top edge. */
const NOTES: Partial<Record<OptionFeedback, string>> = { missed: '漏选', answer: '正确答案' };

function Note({ feedback }: { feedback: OptionFeedback }) {
  return NOTES[feedback] ? <span data-choice-note="">{NOTES[feedback]}</span> : null;
}

/** Only submitted picks mount an animated verdict; idle options stay light. */
function Verdict({ feedback, fresh }: { feedback: OptionFeedback; fresh?: boolean }) {
  const Icon = feedback === 'correct' ? CheckIcon : feedback === 'incorrect' ? XIcon : null;
  return Icon ? <span data-choice-verdict="" aria-hidden="true"><Icon animate={fresh} /></span> : null;
}

const STEPS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/** Arrow keys move between the options of a group; Home / End jump to its ends. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const { key } = event;
  if (!(key in STEPS) && key !== 'Home' && key !== 'End') return;
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-option]'));
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  if (index === -1) return;
  event.preventDefault();
  const next = key === 'Home' ? 0 : key === 'End' ? options.length - 1 : (index + STEPS[key] + options.length) % options.length;
  options[next]?.focus();
}

/**
 * What the options of a gradable question share: the key, the picks and
 * what a press does. Null outside one (no key to grade against), where the
 * options are shown as a plain list.
 */
function useOptionGroup(first: string | undefined) {
  const question = useQuestionState();
  const key = keyLetters(question?.spec);
  if (!question || !key) return null;
  const { selected, submitted, fresh } = question;
  const multiple = question.spec.kind === 'choice' && question.spec.multiple;
  const locked = submitted || !question.ready;
  // Radio pattern: one tab stop, on the picked option or the first.
  const tabStop = multiple ? null : (selected[0] ?? first);

  return {
    multiple,
    fresh,
    group: { role: multiple ? 'group' : 'radiogroup', onKeyDown: moveFocus } as const,
    option(letter: string) {
      const picked = selected.includes(letter);
      const feedback = optionFeedback(letter, { key, selected, submitted, multiple });
      const toggled = picked ? selected.filter((item) => item !== letter) : [...selected, letter];
      return {
        feedback,
        tile: {
          role: multiple ? 'checkbox' : 'radio',
          'aria-checked': picked,
          'aria-disabled': locked || undefined,
          tabIndex: tabStop === null || tabStop === letter ? 0 : -1,
          'data-option': letter,
          'data-feedback': feedback,
          'data-fresh': fresh ? '' : undefined,
          onClick: () => { if (!locked) question.select(multiple ? toggled : [letter]); },
        } as const,
      };
    },
  };
}

const staticTile = buttonVariants({ variant: 'choice', size: 'choice' });

/**
 * The option grid of a choice question: lettered tiles in as many columns
 * as their widest content allows (use-choice-columns). A single answer is
 * graded on click, several are submitted from the footer.
 */
export function ChoiceGroup({ options, density }: { options: ChoiceOption[]; density: ChoiceDensity }) {
  const ref = useRef<HTMLDivElement>(null);
  const group = useOptionGroup(options[0]?.label);
  useChoiceColumns(ref);

  const body = (option: ChoiceOption, feedback: OptionFeedback) => (
    <>
      {/* The letter stays after grading (its disc takes the result's colour); the tick or cross is a corner badge drawn by CSS. */}
      <span data-choice-marker="" aria-hidden="true">
        <span data-choice-letter="">{option.label}</span>
        <Verdict feedback={feedback} fresh={group?.fresh} />
      </span>
      <span data-choice-content="">{option.content}<Note feedback={feedback} /></span>
    </>
  );

  if (!group) {
    return (
      <div ref={ref} role="list" data-exam-choice-group="" data-density={density}>
        {options.map((option) => (
          <div key={option.label} role="listitem" className={staticTile} data-exam-choice-option="" data-option={option.label} data-feedback="idle">
            {body(option, 'idle')}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      {...group.group}
      aria-label={group.multiple ? '选项（可多选）' : '选项'}
      data-exam-choice-group=""
      data-density={density}
      data-multiple={group.multiple ? '' : undefined}
    >
      {options.map((option) => {
        const { feedback, tile } = group.option(option.label);
        return (
          <RippleButton key={option.label} variant="choice" size="choice" tapScale={0.985} {...tile} data-exam-choice-option="">
            {body(option, feedback)}
          </RippleButton>
        );
      })}
    </div>
  );
}

const VERDICTS = [
  { letter: BOOLEAN_TRUE, value: true, label: '正确', icon: CheckIcon },
  { letter: BOOLEAN_FALSE, value: false, label: '错误', icon: XIcon },
] as const;

/**
 * A true / false question: two large tiles, graded on click. The option's
 * own mark stays; after grading a corner badge says whether the pick was
 * right, and a wrong pick also marks the right one.
 */
export function TrueFalse() {
  const group = useOptionGroup(BOOLEAN_TRUE);
  return (
    <div {...group?.group} role="radiogroup" aria-label="判断" data-exam-boolean="">
      {VERDICTS.map((verdict) => {
        const { feedback, tile } = group?.option(verdict.letter)
          ?? { feedback: 'idle' as const, tile: { role: 'radio', 'aria-checked': false, 'aria-disabled': true, 'data-option': verdict.letter, 'data-feedback': 'idle' } as const };
        return (
          <RippleButton key={verdict.letter} variant="choice" size="choice" tapScale={0.985} {...tile} data-boolean-option="" data-value={String(verdict.value)}>
            <span data-boolean-glyph="" aria-hidden="true">
              <verdict.icon animate={'data-fresh' in tile && tile['data-fresh'] !== undefined} />
              <Verdict feedback={feedback} fresh={'data-fresh' in tile && tile['data-fresh'] !== undefined} />
            </span>
            {verdict.label}
            <Note feedback={feedback} />
          </RippleButton>
        );
      })}
    </div>
  );
}
