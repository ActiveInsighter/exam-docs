// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { mirrorQuestion } from '@/components/question/question-mirror';

afterEach(() => { document.body.replaceChildren(); });

describe('solution question mirror', () => {
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
