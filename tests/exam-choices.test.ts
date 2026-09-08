import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { getChoiceDensity } from '@/components/exam-choices';

describe('getChoiceDensity', () => {
  it('marks short options as compact so wide pages can use four columns', () => {
    expect(getChoiceDensity(['A. 1 条', 'B. 2 条', 'C. 3 条', 'D. 4 条'])).toBe(
      'compact',
    );
  });

  it('keeps single-value options compact', () => {
    expect(getChoiceDensity(['A. 0', 'B. 1', 'C. 2', 'D. 3'])).toBe('compact');
  });

  it('treats complex formula structures as regular density', () => {
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
