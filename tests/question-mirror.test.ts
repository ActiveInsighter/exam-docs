// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mirrorQuestion, QuestionMirror } from '@/components/question/question-mirror';
import type { QuestionState } from '@/components/question/question-state';

afterEach(() => { document.body.replaceChildren(); });

describe('solution question mirror', () => {
  it('preserves its DOM and expanded state across equivalent storage acknowledgements', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(300);
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: true, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
    }));
    document.body.innerHTML = '<section id="question-stable"><div data-exam-question-body><p>同一题目</p></div></section>';
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const state = {
      spec: { kind: 'choice', multiple: false, key: ['C'] }, submitted: true,
      values: [], evaluation: { result: 'correct', blanks: [] },
    } as unknown as QuestionState;
    try {
      await act(async () => root.render(createElement(QuestionMirror, { questionId: 'stable', state })));
      const mirror = host.querySelector('[data-question-mirror]')!;
      const copy = mirror.firstChild;
      expect(mirror.hasAttribute('data-folded')).toBe(true);
      await act(async () => host.querySelector('button')!.click());
      expect(mirror.hasAttribute('data-folded')).toBe(false);
      await act(async () => root.render(createElement(QuestionMirror, {
        questionId: 'stable',
        state: {
          ...state,
          spec: { kind: 'choice', multiple: false, key: ['C'] },
          values: [],
          evaluation: { ...state.evaluation!, blanks: [] },
        } as QuestionState,
      })));
      expect(mirror.firstChild).toBe(copy);
      expect(mirror.hasAttribute('data-folded')).toBe(false);

      // A briefly absent source during a document transition should never
      // clear the already-visible copy. The source may reappear next frame.
      document.getElementById('question-stable')!.remove();
      await act(async () => root.render(createElement(QuestionMirror, {
        questionId: 'stable', state: { ...state, submitted: false },
      })));
      expect(mirror.firstChild).toBe(copy);
      expect(mirror.textContent).toContain('同一题目');
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('shows a complete verdict when opened during the source feedback animation', () => {
    document.body.innerHTML = `
      <section id="question-in-flight"><div data-exam-question-body>
        <button data-option="C" data-feedback="correct" style="transform:scale(.985)">
          <span data-choice-marker style="transform:scale(1.12)">
            <span data-choice-verdict style="opacity:0;transform:scale(.5);filter:blur(2px)">
              <svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" pathLength="1" stroke-dasharray=".05 1" stroke-dashoffset="0" style="opacity:0" /></svg>
            </span>
          </span>
        </button>
      </div></section>`;
    const copy = mirrorQuestion('in-flight', null)!;
    const badge = copy.querySelector<HTMLElement>('[data-choice-verdict]')!;
    const path = badge.querySelector('path')!;
    expect(badge.style.opacity).toBe('');
    expect(badge.style.transform).toBe('');
    expect(badge.style.filter).toBe('');
    expect(path.style.opacity).toBe('');
    expect(path.hasAttribute('stroke-dasharray')).toBe(false);
    expect(path.hasAttribute('stroke-dashoffset')).toBe(false);
    expect(path.getAttribute('d')).toBe('m4 12 5 5L20 6');
    expect(copy.querySelector('button')?.dataset.feedback).toBe('correct');
    expect(document.querySelector<HTMLElement>('[data-choice-verdict]')?.style.opacity).toBe('0');
  });

  it('keeps grading feedback without freezing the source button ripple', () => {
    document.body.innerHTML = `
      <section id="question-ripple-lifetime">
        <div data-exam-question-body>
          <button data-option="A" data-feedback="incorrect" data-fresh="" id="source-option">
            <span data-choice-content>答案 A</span>
            <span data-choice-verdict>错误</span>
            <span data-choice-ripple-layer><span style="opacity:.3;transform:scale(8)"></span></span>
          </button>
        </div>
      </section>`;

    const copy = mirrorQuestion('ripple-lifetime', null);
    const option = copy?.querySelector('button');
    expect(option?.getAttribute('data-feedback')).toBe('incorrect');
    expect(option?.textContent).toContain('错误');
    expect(option?.getAttribute('aria-disabled')).toBe('true');
    expect(copy?.querySelector('[data-choice-ripple-layer]')).toBeNull();
    expect(copy?.querySelector('[data-fresh], [id]')).toBeNull();
    // The active source still owns its animation and its cleanup timer.
    expect(document.querySelector('#source-option [data-choice-ripple-layer] > span')).not.toBeNull();
  });
});
