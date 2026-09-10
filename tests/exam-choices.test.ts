import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getChoiceColumnCount } from '@/components/exam-choice-layout';
import {
  ExamChoices,
  ExamOption,
  getChoiceDensity,
} from '@/components/exam-choices';

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

describe('ExamChoices measurement hooks', () => {
  it('renders stable data markers for the shared layout enhancer', () => {
    const markup = renderToStaticMarkup(
      createElement(
        ExamChoices,
        null,
        createElement(ExamOption, null, 'A. 1'),
        createElement(ExamOption, null, 'B. 2'),
        createElement(ExamOption, null, 'C. 3'),
        createElement(ExamOption, null, 'D. 4'),
      ),
    );

    expect(markup).toContain('data-exam-choice-group=""');
    expect(markup.match(/data-exam-choice-option=""/g)).toHaveLength(4);
  });
});
