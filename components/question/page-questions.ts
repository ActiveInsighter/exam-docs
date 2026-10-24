/*
 * Reads the rendered question cards from the DOM, so page-level navigators
 * (the reading workspace, the floating question dock) need no knowledge of
 * <Question> internals. Each card's footer publishes its state in
 * data-attempt-result.
 */

export type PageQuestionStatus = 'idle' | 'draft' | 'correct' | 'partial' | 'incorrect';
export type PageQuestion = { id: string; label: string; status: PageQuestionStatus };

export const QUESTION_SELECTOR = '[data-exam-question]';

const STATUSES = new Set<PageQuestionStatus>(['idle', 'draft', 'correct', 'partial', 'incorrect']);

export const PAGE_QUESTION_STATUS_TEXT: Record<PageQuestionStatus, string> = {
  idle: '未作答',
  draft: '作答中',
  correct: '回答正确',
  partial: '部分正确',
  incorrect: '回答错误',
};

export function readPageQuestions(container: ParentNode): PageQuestion[] {
  return Array.from(container.querySelectorAll<HTMLElement>(QUESTION_SELECTOR), (question, position) => {
    const status = question.querySelector<HTMLElement>('[data-attempt-result]')?.dataset.attemptResult;
    const label = question.querySelector('[data-question-number]')?.textContent?.trim() || String(position + 1);
    return {
      id: question.id,
      label,
      status: status && STATUSES.has(status as PageQuestionStatus) ? (status as PageQuestionStatus) : 'idle',
    };
  });
}

export const samePageQuestions = (left: readonly PageQuestion[], right: readonly PageQuestion[]) =>
  left.length === right.length &&
  left.every((item, index) => item.id === right[index].id && item.status === right[index].status && item.label === right[index].label);
