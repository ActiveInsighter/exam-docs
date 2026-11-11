'use client';

import { ChevronDownIcon } from '@/components/animate-ui/icons/chevron-down';
import { RippleButton } from '@/components/ui/ripple-button';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { keyLetters, optionFeedback, type BlankSpec } from './grading';
import { typesetMath } from './math-preview';
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

type Attempt = Pick<QuestionState, 'spec' | 'submitted' | 'values' | 'evaluation'>;

export function mirrorQuestion(questionId: string, attempt: Attempt | null): HTMLElement | null {
  const source = document.getElementById(`question-${questionId}`)?.querySelector<HTMLElement>('[data-exam-question-body]');
  if (!source) return null;
  const copy = source.cloneNode(true) as HTMLElement;
  // A DOM clone has no Motion lifecycle: never preserve a ripple or a
  // half-drawn result icon from the frame when the sheet was opened.
  copy.querySelectorAll('[data-slot="ripple-button-ripple"]').forEach((node) => node.remove());
  copy.querySelectorAll<HTMLElement>('[data-option]').forEach((option) => option.style.removeProperty('transform'));
  copy.querySelectorAll<SVGElement>('[data-choice-marker] svg, [data-choice-marker] svg *, [data-boolean-glyph] svg, [data-boolean-glyph] svg *').forEach((node) => {
    for (const name of ['transform', 'opacity', 'filter', 'stroke-dasharray', 'stroke-dashoffset']) {
      node.style.removeProperty(name);
      node.removeAttribute(name);
    }
    node.removeAttribute('pathLength');
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
      if (feedback === 'answer') (option.querySelector('[data-choice-content]') ?? option).append(element({ choiceNote: '' }, '正确答案'));
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
  const { spec, submitted = false, values, evaluation = null } = state ?? {};
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const copy = mirrorQuestion(questionId, spec ? { spec, submitted, values: values ?? [], evaluation } : null);
    node.replaceChildren(...(copy ? [copy] : []));
    // Desktop has a pane of its own for the question.
    setFolded(window.matchMedia('(max-width: 767px)').matches && node.scrollHeight > 200 ? true : null);
  }, [questionId, spec, submitted, values, evaluation]);

  return (
    <div className="relative">
      <div ref={host} data-question-mirror="" data-folded={folded ? '' : undefined} className={className} />
      {folded !== null ? (
        <RippleButton
          variant="ghost"
          size="sm"
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-(--ui-fill) px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={!folded}
          onClick={() => setFolded(!folded)}
        >
          <ChevronDownIcon className={cn('transition-transform motion-reduce:transition-none', !folded && 'rotate-180')} />
          {folded ? '展开题目' : '收起题目'}
        </RippleButton>
      ) : null}
    </div>
  );
}
