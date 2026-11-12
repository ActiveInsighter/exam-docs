'use client';

import { RippleButtonSurface, RippleButtonRipples } from '@/components/ui/ripple-button';
import { blur, scale, shift, spring, transition, useTempoTransition } from '@animate-ui/react/utils/motion';
import { motion, type HTMLMotionProps } from 'motion/react';
import { type ComponentProps, type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ChoiceDensity } from './choice-layout';
import { BOOLEAN_FALSE, BOOLEAN_TRUE, keyLetters, optionFeedback, type OptionFeedback } from './grading';
import { CheckIcon, XIcon } from './icons';
import { Pressable, useLive } from './live';
import { useQuestionState } from './question-state';
import { useChoiceColumns } from './use-choice-columns';

/*
 * The answer options of single, multiple and true / false questions. All
 * three are picked by letter: a true / false question is a single choice
 * between A = 正确 and B = 错误, so one group drives both looks.
 *
 * An option is Animate UI's Ripple Button (only cards near the viewport
 * mount its animated surface): it gives on press and a ripple spreads from
 * the point pressed, in the colour of what the press led to (ink for a
 * pick, the result's tone for a grade). What an option shows is
 * its `data-feedback` (grading.ts), styled through the fb-* variants and
 * the tone variables of styles/question.css. Everything is driven by
 * attributes, so the solution card's read-only copy of a question
 * (question-mirror.tsx) restyles by changing them alone.
 */

export type ChoiceOption = {
  /** Stable key used for selection and grading (A, B, …). */
  label: string;
  content: ReactNode;
};

/* ------------------------------------------------------------------ looks */

/** The option's surface, by feedback: a hairline at rest, ink when picked, the result's tone when graded. */
const tile = cn(
  'group/option relative isolate flex min-w-0 rounded-[0.875rem] border border-(--exam-line) text-left text-foreground [font:inherit] outline-none',
  'transition-[border-color,box-shadow] duration-200 ease-out',
  'fb-picked:border-(--exam-choice-ring-strong) fb-picked:shadow-[inset_0_0_0_0.5px_var(--exam-choice-ring-strong)]',
  'fb-graded:border-(--tone-line)',
  // A key the reader did not pick is only outlined, so a graded card never turns into blocks of colour.
  'fb-key:border-dashed fb-key:border-(--tone-line)',
  'fb-dimmed:border-(--exam-line-faint) fb-dimmed:*:opacity-50',
  // The solution card shows the key as the reference itself: filled.
  'in-data-solution-card:data-[feedback=answer]:border-solid in-data-solution-card:data-[feedback=answer]:bg-(--tone-tint)',
);

const pressable = cn(
  'cursor-pointer select-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-3 focus-visible:ring-ring/50',
  'fb-idle:hover:border-(--exam-line-hover) aria-disabled:pointer-events-none',
  '[--ripple-button-ripple-color:color-mix(in_oklch,var(--foreground)_38%,transparent)] fb-graded:[--ripple-button-ripple-color:var(--tone)]',
);

const choiceTile = cn(
  tile,
  'min-h-12 items-start gap-[0.6875rem] py-2.5 pr-3.5 pl-[0.6875rem] leading-[1.65] wrap-anywhere',
  // While columns are measured, options lay out on one line at their natural width.
  'group-data-measuring/choices:w-max group-data-measuring/choices:max-w-none group-data-measuring/choices:whitespace-nowrap',
);

const booleanTile = cn(tile, 'h-12 items-center justify-center gap-2 font-medium');

/** The letter (or the mark of a true / false option) on its disc. */
const marker = cn(
  'relative z-10 grid shrink-0 place-items-center rounded-full transition-colors duration-200',
  'group-fb-graded/option:bg-(--tone-soft) group-fb-graded/option:text-(--tone-ink) group-fb-key/option:bg-(--tone-soft) group-fb-key/option:text-(--tone-ink)',
);

const letterMarker = cn(
  marker,
  // Computer Modern math italic, like a variable in a formula; squarer when several can be picked.
  'mt-px size-7 bg-(--exam-marker) [font-family:var(--exam-letter-font)] text-lg leading-none text-foreground/80 italic group-data-multiple/choices:rounded-lg',
  'group-fb-idle/option:group-hover/option:bg-(--exam-marker-hover) group-fb-picked/option:bg-foreground group-fb-picked/option:text-background',
);

const glyphMarker = cn(
  marker,
  'size-6.5 text-muted-foreground shadow-[inset_0_0_0_1px_var(--exam-marker-ring)] group-fb-graded/option:shadow-none group-fb-key/option:shadow-none',
  'group-fb-idle/option:group-hover/option:bg-(--exam-marker-hover) group-fb-idle/option:group-hover/option:text-foreground',
);

/**
 * "漏选" / "正确答案": a tab on the option's top edge. It takes no inline
 * space, so it never covers the option's text however narrow the column.
 * Exported for the solution card's copy, which adds it by hand.
 */
export const choiceNoteClassName = cn(
  'pointer-events-none absolute top-0 right-3 z-10 inline-flex h-4.5 -translate-y-1/2 items-center rounded-full bg-(--tone-soft) px-1.75',
  'font-sans text-[0.6875rem] leading-none font-semibold tracking-wide whitespace-nowrap text-(--tone-ink) not-italic shadow-[inset_0_0_0_1px_var(--tone-line)]',
  'group-data-measuring/choices:hidden group-data-fresh/option:animate-in group-data-fresh/option:fade-in group-data-fresh/option:delay-150 group-data-fresh/option:duration-300 group-data-fresh/option:fill-mode-both',
);

const NOTES: Partial<Record<OptionFeedback, string>> = { missed: '漏选', answer: '正确答案' };

function Note({ feedback }: { feedback: OptionFeedback }) {
  return NOTES[feedback] ? <span data-choice-note="" className={choiceNoteClassName}>{NOTES[feedback]}</span> : null;
}

/* ----------------------------------------------------------------- pieces */

type Verdict = 'correct' | 'incorrect';
const verdictOf = (feedback: OptionFeedback): Verdict | null => (feedback === 'correct' || feedback === 'incorrect' ? feedback : null);

/**
 * The verdict on a pick: a small tick or cross on the marker's corner, so
 * the letter stays readable ("you picked B, the key is C"). Graded in this
 * visit, it pops in a beat after the press and draws its mark; a restored
 * grade is simply there.
 */
const verdictBadge = 'absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full bg-(--tone) text-(--exam-verdict-mark) shadow-[0_0_0_1.5px_var(--tone-tint)]';

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const Icon = verdict === 'correct' ? CheckIcon : XIcon;
  return <span data-choice-verdict="" className={verdictBadge}><Icon size={10} strokeWidth={4} /></span>;
}

function FreshVerdictBadge({ verdict }: { verdict: Verdict }) {
  const pop = useTempoTransition({ ...spring.checkPop, delay: 0.12 });
  const Icon = verdict === 'correct' ? CheckIcon : XIcon;
  return (
    <motion.span
      data-choice-verdict=""
      initial={{ opacity: 0, scale: scale.icon, filter: blur.icon }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={pop}
      className={verdictBadge}
    >
      <Icon size={10} strokeWidth={4} animate="path" />
    </motion.span>
  );
}

/** A marker graded in this visit answers the press: a wrong pick shakes its head, a right one swells. */
function FreshMarker({ verdict, className, children }: { verdict: Verdict; className: string; children: ReactNode }) {
  const shake = useTempoTransition(transition.shake);
  const swell = useTempoTransition({ duration: 0.4, ease: 'easeOut', delay: 0.06 });
  return (
    <motion.span
      data-choice-marker=""
      aria-hidden="true"
      className={className}
      animate={verdict === 'incorrect'
        ? { x: [0, -shift.shake, shift.shake, -2, 1, 0], transition: shake }
        : { scale: [1, 1.12, 1], transition: swell }}
    >
      {children}
      <FreshVerdictBadge verdict={verdict} />
    </motion.span>
  );
}

function Marker({ feedback, fresh, className, children }: { feedback: OptionFeedback; fresh: boolean; className: string; children: ReactNode }) {
  const verdict = verdictOf(feedback);
  if (verdict && fresh) return <FreshMarker verdict={verdict} className={className}>{children}</FreshMarker>;
  return (
    <span data-choice-marker="" aria-hidden="true" className={className}>
      {children}
      {verdict ? <VerdictBadge verdict={verdict} /> : null}
    </span>
  );
}

/** Official ripple surface: feedback never paints the entire button behind it. */
function ChoiceButton(props: ComponentProps<typeof Pressable>) {
  return useLive() ? <LiveChoiceButton {...props} /> : <Pressable {...props} />;
}

function LiveChoiceButton({ children, type = 'button', tapScale, onPointerDown, onKeyDown, ...props }: ComponentProps<typeof Pressable>) {
  const [rippleScale, setRippleScale] = useState(36);
  // One measurement per interaction, never a per-frame React update or a
  // ResizeObserver per option. Even an edge click reaches the far corner.
  const sizeRipple = (node: HTMLButtonElement) => {
    setRippleScale(Math.max(10, Math.hypot(node.offsetWidth, node.offsetHeight) / 10));
  };
  return (
    <RippleButtonSurface
      type={type}
      tapScale={tapScale}
      {...props as Omit<HTMLMotionProps<'button'>, 'children'>}
      onPointerDown={(event) => { sizeRipple(event.currentTarget); onPointerDown?.(event); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') sizeRipple(event.currentTarget);
        onKeyDown?.(event);
      }}
    >
      {children}
      <span data-choice-ripple-layer="" aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
        <RippleButtonRipples scale={rippleScale} />
      </span>
    </RippleButtonSurface>
  );
}

/* ------------------------------------------------------------------ state */

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
        button: {
          type: 'button',
          role: multiple ? 'checkbox' : 'radio',
          'aria-checked': picked,
          'aria-disabled': locked || undefined,
          tabIndex: tabStop === null || tabStop === letter ? 0 : -1,
          'data-option': letter,
          'data-feedback': feedback,
          'data-fresh': fresh ? '' : undefined,
          // A whole row gives less than a button; a locked one not at all (and takes no ripple).
          tapScale: locked ? 1 : scale.choice,
          onClickCapture: locked ? (event: { stopPropagation: () => void }) => { event.stopPropagation(); } : undefined,
          onClick: () => question.select(multiple ? toggled : [letter]),
          // The tab on the top edge reaches past the option; the ripples are clipped by their own layer.
          style: { overflow: 'visible' },
        } as const,
      };
    },
  };
}

/* ----------------------------------------------------------------- groups */

/**
 * The option grid of a choice question: lettered options in as many columns
 * as their widest content allows (use-choice-columns). A single answer is
 * graded on click, several are submitted from the footer.
 */
export function ChoiceGroup({ options, density }: { options: ChoiceOption[]; density: ChoiceDensity }) {
  const ref = useRef<HTMLDivElement>(null);
  const group = useOptionGroup(options[0]?.label);
  useChoiceColumns(ref);

  const body = (option: ChoiceOption, feedback: OptionFeedback) => (
    <>
      <Marker feedback={feedback} fresh={group?.fresh ?? false} className={letterMarker}>
        {/* Capitals trimmed to cap height centre optically; the italic leans right, so it is nudged back a hair. */}
        <span data-choice-letter="" className="-translate-x-[0.04em] [text-box:trim-both_cap_alphabetic]">{option.label}</span>
      </Marker>
      <span
        data-choice-content=""
        className="relative z-10 block min-w-0 flex-1 py-px [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&>.katex]:text-[1.08em] [&>:first-child]:mt-0 [&>:last-child]:mb-0"
      >
        {option.content}
      </span>
      <Note feedback={feedback} />
    </>
  );

  const grid = cn(
    'group/choices mt-3.5 mb-1 grid w-full grid-cols-[repeat(var(--choice-cols-measured,var(--choice-cols,1)),minmax(0,1fr))] gap-2.5',
    // Fallback columns until measured (and in the solution card's copy).
    'data-[density=compact]:@xs:[--choice-cols:2] data-[density=compact]:@xl:[--choice-cols:4] data-[density=regular]:@xl:[--choice-cols:2]',
  );

  if (!group) {
    return (
      <div ref={ref} role="list" data-exam-choice-group="" data-density={density} className={grid}>
        {options.map((option) => (
          <div key={option.label} role="listitem" className={choiceTile} data-exam-choice-option="" data-option={option.label} data-feedback="idle">
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
      className={grid}
    >
      {options.map((option) => {
        const { feedback, button } = group.option(option.label);
        return (
          <ChoiceButton key={option.label} {...button} data-exam-choice-option="" className={cn(choiceTile, pressable)}>
            {body(option, feedback)}
          </ChoiceButton>
        );
      })}
    </div>
  );
}

const VERDICTS = [
  { letter: BOOLEAN_TRUE, value: true, label: '正确', Icon: CheckIcon },
  { letter: BOOLEAN_FALSE, value: false, label: '错误', Icon: XIcon },
] as const;

/**
 * A true / false question: two large options, graded on click. The option's
 * own mark stays (drawing itself when graded); a corner badge says whether
 * the pick was right, and a wrong pick also marks the right one.
 */
export function TrueFalse() {
  const group = useOptionGroup(BOOLEAN_TRUE);
  return (
    <div {...group?.group} role="radiogroup" aria-label="判断" data-exam-boolean="" className="mt-3.5 mb-1 grid max-w-[26rem] grid-cols-2 gap-2.5">
      {VERDICTS.map(({ letter, value, label, Icon }) => {
        const { feedback, button } = group?.option(letter) ?? {
          feedback: 'idle' as const,
          button: { type: 'button', role: 'radio', 'aria-checked': false, 'aria-disabled': true, 'data-option': letter, 'data-feedback': 'idle', tapScale: 1, style: { overflow: 'visible' } } as const,
        };
        const fresh = group?.fresh ?? false;
        return (
          <ChoiceButton key={letter} {...button} data-boolean-option="" data-value={String(value)} className={cn(booleanTile, pressable)}>
            <Marker feedback={feedback} fresh={fresh} className={glyphMarker}>
              <Icon size={14} strokeWidth={2.75} animate={fresh && verdictOf(feedback) ? 'path' : false} />
            </Marker>
            <span className="relative z-10">{label}</span>
            <Note feedback={feedback} />
          </ChoiceButton>
        );
      })}
    </div>
  );
}
