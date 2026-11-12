'use client';

import { AnimateIcon } from '@animate-ui/react/icons';
import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/animate-ui/icons/chevron-down';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { keyLetters, optionFeedback, type BlankSpec } from './grading';
import { typesetMath } from './math-preview';
import { choiceNoteClassName } from './options';
import type { QuestionState } from './question-state';

/*
 * The solution sheet shows the question the reader is looking at by copying
 * its rendered DOM instead of rendering the stem a second time. A question
 * page's payload therefore carries every stem once, and the copy matches the
 * page exactly (formulas, images, measured layout).
 *
 * The copy is read-only and reveals the key: an unanswered question's
 * options get the feedback of the reference answer (the same data
 * attributes, so the same styles apply), blanks become their answers.
 */

function element(data: Record<string, string>, text = '') {
  const node = document.createElement('span');
  Object.assign(node.dataset, data);
  node.textContent = text;
  return node;
}

/** An answer in place of a blank: maths typeset, a LaTeX key from its compile-time HTML. */
function chip(text: string, feedback: string, blank: BlankSpec, html?: string) {
  const node = element({ questionBlank: '', feedback, kind: blank.kind });
  if (blank.kind === 'math') node.append(typesetMath(text));
  else if (html) {
    node.dataset.texAnswer = '';
    node.innerHTML = html;
  } else node.textContent = text;
  return node;
}

type Attempt = Pick<QuestionState, 'spec' | 'submitted' | 'values'> & {
  evaluation: Pick<NonNullable<QuestionState['evaluation']>, 'blanks'> | null;
};

export function mirrorQuestion(questionId: string, attempt: Attempt | null): HTMLElement | null {
  const source = document.getElementById(`question-${questionId}`)?.querySelector<HTMLElement>('[data-exam-question-body]');
  if (!source) return null;
  const copy = source.cloneNode(true) as HTMLElement;
  // A cloned ripple has no owner left to remove it after its short lifetime.
  // Copy permanent grading feedback, never an in-flight visual effect.
  copy.querySelectorAll('[data-choice-ripple-layer]').forEach((node) => node.remove());
  // cloneNode copies Motion's inline starting / intermediate values, but
  // neither its controls nor its WAAPI animations. Opening during feedback
  // must not freeze a hidden badge or a half-drawn tick in the sheet.
  copy.querySelectorAll<HTMLElement | SVGElement>('[data-option], [data-choice-marker], [data-choice-verdict], [data-choice-marker] svg, [data-choice-marker] svg *').forEach((node) => {
    for (const property of ['opacity', 'transform', 'filter']) node.style.removeProperty(property);
    for (const attribute of ['stroke-dasharray', 'stroke-dashoffset', 'pathLength']) node.removeAttribute(attribute);
  });
  // A copy shows the state as it is: no ids to clash, no motion still running on the page to replay.
  for (const name of ['id', 'data-fresh']) {
    copy.querySelectorAll(`[${name}]`).forEach((node) => node.removeAttribute(name));
  }
  copy.querySelectorAll<HTMLElement>('[data-exam-choice-group]').forEach((group) => group.style.removeProperty('--choice-cols-measured'));
  copy.querySelectorAll<HTMLElement>('button, input, [tabindex]').forEach((node) => {
    node.tabIndex = -1;
    node.setAttribute('aria-disabled', 'true');
  });
  if (!attempt) return copy;

  const { spec, submitted } = attempt;
  const key = keyLetters(spec);
  if (key && !submitted) {
    copy.querySelectorAll<HTMLElement>('[data-option]').forEach((option) => {
      const feedback = optionFeedback(option.dataset.option ?? '', { key, selected: [], submitted, reveal: true });
      option.dataset.feedback = feedback;
      option.querySelector('[data-choice-note]')?.remove();
      if (feedback === 'answer') {
        const note = element({ choiceNote: '' }, '正确答案');
        note.className = choiceNoteClassName;
        option.append(note);
      }
    });
  }
  if (spec.kind === 'blank') {
    copy.querySelectorAll<HTMLInputElement>('input[data-question-blank]').forEach((input, index) => {
      const blank = spec.blanks[index];
      if (!blank) return;
      const typed = submitted ? attempt.values[index]?.trim() : '';
      const holder = document.createElement('span');
      holder.className = 'inline-flex flex-wrap items-baseline gap-1';
      if (submitted && attempt.evaluation?.blanks[index] === 'correct') {
        // Self-graded without typing: the key stands for what the reader worked out.
        holder.append(typed ? chip(typed, 'correct', blank) : chip(blank.answer, 'correct', blank, blank.html));
      } else {
        if (typed) holder.append(chip(typed, 'incorrect', blank));
        holder.append(chip(blank.answer, 'answer', blank, blank.html));
      }
      input.replaceWith(holder);
    });
  }
  return copy;
}

/** The copy in the sheet. Phones fold a long question to a few lines so the answer is in view. */
export function QuestionMirror({ questionId, state, className }: { questionId: string; state: QuestionState | null; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<boolean | null>(null);

  // Only what the copy shows: a draft pick or a sync tick must not rebuild (and refold) it.
  const { spec, submitted = false } = state ?? {};
  // React may supply a new spec object when marks or storage status changes.
  // Replacing an identical, visible DOM clone resets its paint and can flash
  // during the sheet's entrance. Compare the actual grading data instead.
  const specKey = JSON.stringify(spec ?? null);
  const currentSpec = useRef(spec);
  currentSpec.current = spec;
  const foldedFor = useRef<string | null>(null);
  const valuesKey = JSON.stringify(spec?.kind === 'blank' && submitted ? state?.values ?? [] : []);
  const gradesKey = JSON.stringify(spec?.kind === 'blank' && submitted ? state?.evaluation?.blanks ?? [] : []);
  const selectedKey = JSON.stringify(submitted ? state?.selected ?? [] : []);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const liveSpec = currentSpec.current;
    const copy = mirrorQuestion(questionId, liveSpec ? {
      spec: liveSpec, submitted, values: JSON.parse(valuesKey), evaluation: { blanks: JSON.parse(gradesKey) },
    } : null);
    // The source can briefly be absent while its document subtree updates.
    // Keep the last complete frame instead of clearing the visible mirror.
    if (!copy) return;
    node.replaceChildren(copy);
    // A grading or sync update must not fold a question the reader expanded.
    if (foldedFor.current !== questionId) {
      foldedFor.current = questionId;
      setFolded(window.matchMedia('(max-width: 767px)').matches && node.scrollHeight > 200 ? true : null);
    }
  }, [questionId, specKey, submitted, valuesKey, gradesKey, selectedKey]);

  return (
    <div className="relative">
      <div
        ref={host}
        data-question-mirror=""
        data-folded={folded ? '' : undefined}
        className={cn('data-folded:max-h-50 data-folded:overflow-hidden data-folded:mask-b-from-[calc(100%_-_2.5rem)]', className)}
      />
      {folded !== null ? (
        <AnimateIcon animateOnHover asChild>
          <Button
            variant="ghost"
            size="xs"
            className="mt-1 rounded-full bg-(--ui-fill) px-3 text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground"
            aria-expanded={!folded}
            onClick={() => setFolded(!folded)}
          >
            <ChevronDownIcon size={14} className={cn('transition-transform duration-200 motion-reduce:transition-none', !folded && 'rotate-180')} />
            {folded ? '展开题目' : '收起题目'}
          </Button>
        </AnimateIcon>
      ) : null}
    </div>
  );
}
