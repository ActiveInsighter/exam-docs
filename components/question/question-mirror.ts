import { typesetMath } from './math-preview';
import type { BlankVerdict, GradingSpec } from './grading';

/*
 * The solution sheet shows the question the reader is looking at by copying
 * its rendered DOM instead of rendering the stem a second time. A question
 * page's payload therefore carries every stem once, and the copy matches the
 * page exactly (formulas, images, measured layout).
 *
 * The copy is read-only: option feedback is re-derived through data
 * attributes (styles live in question.css), blanks become their answers.
 */

type MirrorState = {
  spec: GradingSpec | null;
  submitted: boolean;
  values: readonly string[];
  verdicts: readonly BlankVerdict[];
};

function note(text: string) {
  const element = document.createElement('span');
  element.dataset.choiceNote = '';
  element.textContent = text;
  return element;
}

function blankChip(text: string, feedback: string, kind: string | undefined) {
  const chip = document.createElement('span');
  chip.dataset.questionBlank = '';
  chip.dataset.feedback = feedback;
  if (kind) chip.dataset.kind = kind;
  if (kind === 'math') chip.append(typesetMath(text));
  else chip.textContent = text;
  return chip;
}

export function mirrorQuestion(questionId: string, state: MirrorState): HTMLElement | null {
  const source = document.getElementById(`question-${questionId}`)?.querySelector<HTMLElement>('[data-exam-question-body]');
  if (!source) return null;
  const copy = source.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  copy.querySelectorAll('[data-fresh]').forEach((element) => element.removeAttribute('data-fresh'));
  copy.querySelectorAll<HTMLElement>('[data-exam-choice-group]').forEach((group) => group.style.removeProperty('--choice-cols-measured'));
  copy.querySelectorAll<HTMLElement>('button, input, [tabindex]').forEach((element) => {
    element.tabIndex = -1;
    element.setAttribute('aria-disabled', 'true');
  });

  const { spec, submitted } = state;
  if (spec?.kind === 'choice' && !submitted) {
    copy.querySelectorAll<HTMLElement>('[data-exam-choice-option]').forEach((option) => {
      const isKey = spec.key.includes(option.dataset.optionLabel ?? '');
      option.dataset.feedback = isKey ? 'answer' : 'idle';
      option.dataset.reveal = isKey ? 'on' : 'off';
      option.querySelector('[data-choice-note]')?.remove();
      if (isKey) option.append(note('正确答案'));
    });
  }
  if (spec?.kind === 'boolean' && !submitted) {
    const key = String(spec.answer);
    copy.querySelectorAll<HTMLElement>('[data-boolean-option]').forEach((option) => {
      option.dataset.feedback = option.dataset.value === key ? 'answer' : 'idle';
      option.dataset.reveal = option.dataset.value === key ? 'on' : 'off';
    });
  }
  if (spec?.kind === 'blank') {
    copy.querySelectorAll<HTMLInputElement>('input[data-question-blank]').forEach((input, index) => {
      const blank = spec.blanks[index];
      if (!blank) return;
      const verdict = state.verdicts[index];
      const holder = document.createElement('span');
      holder.className = 'inline-flex flex-wrap items-baseline gap-1';
      if (submitted && verdict === 'correct') {
        holder.append(blankChip(state.values[index] ?? '', 'correct', blank.kind));
      } else {
        if (submitted && state.values[index]?.trim()) {
          const wrong = blankChip(state.values[index], 'incorrect', blank.kind);
          wrong.style.textDecoration = 'line-through';
          holder.append(wrong);
        }
        holder.append(blankChip(blank.answer, 'answer', blank.kind));
      }
      input.replaceWith(holder);
    });
  }
  return copy;
}
