import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getChoiceColumnCount, getChoiceDensity } from '@/components/question/choice-layout';
import { Blank, Option, Question, Solution } from '@/components/question';
import { parseQuestionTags } from '@/components/question/model';
import { QuestionPointTags, QuestionSourceTrail } from '@/components/question/question-tags';

describe('getChoiceDensity', () => {
  it('marks short options as compact so wide pages can use four columns', () => {
    expect(getChoiceDensity(['A. 1 条', 'B. 2 条', 'C. 3 条', 'D. 4 条'])).toBe(
      'compact',
    );
  });

  it('keeps single-value options compact', () => {
    expect(getChoiceDensity(['A. 0', 'B. 1', 'C. 2', 'D. 3'])).toBe('compact');
  });

  it('uses a conservative fallback for complex formula structures', () => {
    const fraction = createElement('span', { className: 'mfrac' }, '1/e');
    const formula = createElement('span', { className: 'katex' }, fraction);

    expect(getChoiceDensity([formula, 'B. 1', 'C. 2', 'D. 3'])).toBe('regular');
  });

  it('keeps medium-length options in a readable two-column layout', () => {
    expect(
      getChoiceDensity([
        'A. 有且仅有水平渐近线',
        'B. 有且仅有铅直渐近线',
        'C. 既有水平渐近线，也有铅直渐近线',
        'D. 既无水平渐近线，也无铅直渐近线',
      ]),
    ).toBe('regular');
  });

  it('marks very long options so they can fall back to one column', () => {
    expect(
      getChoiceDensity([
        'A. 这是一个需要在窄屏上保持完整阅读的很长选项内容',
        'B. 另一个同样较长的选项内容',
      ]),
    ).toBe('long');
  });
});

describe('getChoiceColumnCount', () => {
  it('uses four columns when all four rendered options fit', () => {
    expect(
      getChoiceColumnCount({
        containerWidth: 720,
        optionWidths: [52, 64, 48, 58],
        columnGap: 32,
      }),
    ).toBe(4);
  });

  it('allows a visually short rendered formula to use four columns', () => {
    expect(
      getChoiceColumnCount({
        containerWidth: 720,
        optionWidths: [112, 45, 45, 45],
        columnGap: 32,
      }),
    ).toBe(4);
  });

  it('falls back to two columns when four columns would wrap', () => {
    expect(
      getChoiceColumnCount({
        containerWidth: 720,
        optionWidths: [270, 210, 260, 240],
        columnGap: 32,
      }),
    ).toBe(2);
  });

  it('falls back to one column when even two columns would wrap', () => {
    expect(
      getChoiceColumnCount({
        containerWidth: 640,
        optionWidths: [360, 310, 340, 290],
        columnGap: 32,
      }),
    ).toBe(1);
  });

  it('does not create an awkward four-column grid for three options', () => {
    expect(
      getChoiceColumnCount({
        containerWidth: 720,
        optionWidths: [60, 60, 60],
        columnGap: 32,
      }),
    ).toBe(2);
  });
});

type Choice = string | { text: string; correct?: boolean };

function options(...items: Choice[]) {
  return items.map((item, index) => {
    const { text, correct } = typeof item === 'string' ? { text: item, correct: false } : item;
    return createElement(Option, { key: index, correct }, text);
  });
}

function question(
  props: { type: 'single' | 'multiple' | 'boolean' | 'essay'; answer?: boolean },
  ...children: ReturnType<typeof createElement>[]
) {
  return createElement(
    Question,
    { id: 'q1', ...props },
    createElement('p', { key: 'prompt' }, '题干'),
    ...children,
    createElement(Solution, { key: 'solution' }, '解析内容'),
  );
}

const single = (...items: Choice[]) => question({ type: 'single' }, ...options(...items));

describe('Question choices', () => {
  it('renders stable data markers for the shared layout measurement', () => {
    const markup = renderToStaticMarkup(
      single('1', { text: '2', correct: true }, '3', '4'),
    );

    expect(markup).toContain('data-exam-choice-group=""');
    expect(markup).toContain('data-density="compact"');
    expect(markup.match(/data-exam-choice-option=""/g)).toHaveLength(4);
  });

  it('numbers the options with automatic letters', () => {
    const markup = renderToStaticMarkup(single('有穷性', { text: '可读性', correct: true }));

    expect(markup).toContain('>A</span>');
    expect(markup).toContain('>B</span>');
    expect(markup).toContain('>有穷性</span>');
  });

  it('becomes a radio group graded on click', () => {
    const markup = renderToStaticMarkup(single('1', { text: '2', correct: true }, '3', '4'));

    expect(markup).toContain('role="radiogroup"');
    expect(markup.match(/role="radio"/g)).toHaveLength(4);
    expect(markup.match(/aria-checked="false"/g)).toHaveLength(4);
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="选项"');
    expect(markup).not.toContain('提交答案');
    expect(markup).toContain('data-question-type="single"');
  });

  it('offers an explicit submit step for multiple answers', () => {
    const markup = renderToStaticMarkup(
      question(
        { type: 'multiple' },
        ...options({ text: '1', correct: true }, '2', { text: '3', correct: true }, '4'),
      ),
    );

    expect(markup).toContain('aria-label="选项（可多选）"');
    expect(markup.match(/role="checkbox"/g)).toHaveLength(4);
    expect(markup).toContain('data-multiple=""');
    expect(markup).toContain('提交答案');
  });

  it('shows options statically when the key is missing or inconsistent', () => {
    const noKey = renderToStaticMarkup(single('1', '2'));
    const twoKeys = renderToStaticMarkup(single({ text: '1', correct: true }, { text: '2', correct: true }));

    for (const markup of [noKey, twoKeys]) {
      expect(markup).toContain('role="list"');
      expect(markup).not.toContain('role="radio"');
    }
  });

  it('grades a boolean question through two true / false buttons', () => {
    const markup = renderToStaticMarkup(question({ type: 'boolean', answer: false }));

    expect(markup).toContain('data-exam-boolean=""');
    expect(markup).toContain('data-value="true"');
    expect(markup).toContain('data-value="false"');
    expect(markup).toContain('正确</button>');
    expect(markup).toContain('错误</button>');
    expect(markup.match(/role="radio"/g)).toHaveLength(2);
    expect(markup).not.toContain('提交答案');
  });

  it('turns blanks into inputs with a submit step', () => {
    const markup = renderToStaticMarkup(
      createElement(
        Question,
        { id: 'q2', type: 'blank' },
        createElement('p', { key: 'stem' }, 'TCP 位于', createElement(Blank, { answer: '传输层' }), '。'),
        createElement(Solution, { key: 'solution' }, '解析内容'),
      ),
    );

    expect(markup).toContain('data-question-blank=""');
    expect(markup).toContain('data-kind="text"');
    expect(markup).toContain('inputMode="text"');
    expect(markup).toContain('提交答案');
  });

  it('gives numeric and maths blanks the keypad instead of the system keyboard', () => {
    const markup = renderToStaticMarkup(
      createElement(
        Question,
        { id: 'q6', type: 'blank' },
        createElement('p', { key: 'stem' }, '握手', createElement(Blank, { answer: '3' }), '次，', createElement(Blank, { answer: 'x^2', kind: 'math' }), '；', createElement(Blank, { answer: '42', kind: 'text' })),
      ),
    );

    expect(markup.match(/inputMode="none"/g)).toHaveLength(2);
    expect(markup.match(/data-kind="math"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="第 3 空"');
    expect(markup.match(/data-blank-index=""/g)).toHaveLength(3);
  });

  it('shows type and source in the header and keeps knowledge points for the solution', () => {
    const markup = renderToStaticMarkup(
      createElement(Question, { id: 'q7', type: 'essay', points: 9, tags: '王道8套卷, 来源:第4套, 易错, 考点:VLAN' }, createElement('p', null, '题干')),
    );

    expect(markup).toContain('data-type="essay"');
    expect(markup).toContain('<span data-type-points="">9 分</span>');
    expect(markup).not.toContain('data-question-tag="type"');
    expect(markup).toContain('王道8套卷第4套');
    expect(markup.match(/data-trail-step=""/g)).toHaveLength(1);
    expect(markup).not.toContain('VLAN');
  });

  it('shortens legacy sources and keeps knowledge points separate', () => {
    const tags = parseQuestionTags('来源:王道·卷一-Q01, 科目:数据结构, 章节:绪论, 考点:算法特征');
    const source = renderToStaticMarkup(createElement(QuestionSourceTrail, { tags: tags.source }));
    const points = renderToStaticMarkup(createElement(QuestionPointTags, { tags: tags.point }));
    expect(source).toContain('王道·卷一');
    expect(source).not.toContain('Q01');
    expect(source).not.toContain('数据结构');
    expect(source).not.toContain('绪论');
    expect(points).toContain('算法特征');
  });

  it('prints the resolved number in front of the stem', () => {
    const numbered = renderToStaticMarkup(
      createElement(Question, { id: 'q3', type: 'essay', index: '7' }, createElement('p', null, '简述进程。')),
    );
    const hidden = renderToStaticMarkup(
      createElement(Question, { id: 'q4', type: 'essay', index: '7', number: false }, createElement('p', null, '简述进程。')),
    );

    expect(numbered).toContain('data-question-number=""');
    expect(numbered).toContain('>7</span>');
    expect(hidden).not.toContain('data-question-number');
  });

  it('keeps the solution out of the page and behind the dialog trigger', () => {
    const markup = renderToStaticMarkup(single('1', { text: '2', correct: true }));

    expect(markup).toContain('data-solution-trigger=""');
    expect(markup).toContain('查看解答');
    expect(markup).not.toContain('解析内容');
  });

  it('omits the dialog trigger for a question without a solution', () => {
    const markup = renderToStaticMarkup(
      createElement(Question, { id: 'q5', type: 'essay' }, createElement('p', null, '题干')),
    );

    expect(markup).not.toContain('data-solution-trigger');
  });
});
