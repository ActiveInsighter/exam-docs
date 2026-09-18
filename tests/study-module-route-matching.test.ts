import { describe, expect, it } from 'vitest';

import {
  createStudyModuleTabs,
  getRouteMatchVariants,
  STUDY_MODULES,
} from '../lib/study-modules';

describe('study module route matching', () => {
  it('keeps raw and percent-encoded Unicode pathnames equivalent', () => {
    const variants = getRouteMatchVariants('/docs/数学真题/01-高数');

    expect(variants.has('/docs/数学真题/01-高数')).toBe(true);
    expect(
      variants.has(
        '/docs/%E6%95%B0%E5%AD%A6%E7%9C%9F%E9%A2%98/01-%E9%AB%98%E6%95%B0',
      ),
    ).toBe(true);
  });

  it('activates every Chinese module from encoded browser pathnames', () => {
    const tabs = createStudyModuleTabs([
      '/docs/数学',
      '/docs/数学真题/01-test',
      '/docs/408',
      '/docs/408真题/2010',
      '/docs/政治',
      '/docs/政治/2010',
      '/docs/英语',
      '/docs/编程',
      '/docs/algorithm/array',
    ]);

    const byTitle = new Map(tabs.map((tab) => [tab.title, tab]));

    expect(
      byTitle
        .get('数学')
        ?.urls.has('/docs/%E6%95%B0%E5%AD%A6%E7%9C%9F%E9%A2%98/01-test'),
    ).toBe(true);
    expect(
      byTitle
        .get('408')
        ?.urls.has('/docs/408%E7%9C%9F%E9%A2%98/2010'),
    ).toBe(true);
    expect(
      byTitle
        .get('政治')
        ?.urls.has('/docs/%E6%94%BF%E6%B2%BB/2010'),
    ).toBe(true);
    expect(
      byTitle.get('英语')?.urls.has('/docs/%E8%8B%B1%E8%AF%AD'),
    ).toBe(true);
    expect(byTitle.get('编程')?.urls.has('/docs/algorithm/array')).toBe(true);
  });

  it('defines exactly one navigation entry per study module', () => {
    expect(STUDY_MODULES.map((module) => module.title)).toEqual([
      '数学',
      '408',
      '政治',
      '英语',
      '编程',
    ]);
  });
});
