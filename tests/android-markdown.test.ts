import { describe, expect, it } from 'vitest';
import { renderAndroidMarkdown } from '../lib/markdown-export.mjs';
import { getStaticAndroidMarkdownOutputPath } from '../scripts/static-docs-markdown.mjs';

describe('android markdown export', () => {
  it('maps source paths to .android.md output paths', () => {
    expect(getStaticAndroidMarkdownOutputPath('intro.mdx')).toBe('docs/intro.android.md');
    expect(getStaticAndroidMarkdownOutputPath('math/index.mdx')).toBe('docs/math.android.md');
    expect(getStaticAndroidMarkdownOutputPath('index.mdx')).toBe('docs.android.md');
  });

  it('emits structured custom blocks without AI path headers', async () => {
    const raw = `---
title: 函数性质
---

import { Callout } from '@/components/mdx/callout';

<Callout type="tip" title="提示">
注意定义域对称。
</Callout>

<Question number={1} type="single" points={4} tags="高数,基础">
已知 $f(x)$ 为奇函数，则 $f(0) = $？
<Option correct={true}>$0$</Option>
<Option>$1$</Option>
<Solution>
因为 $f(-0) = -f(0)$，所以 $f(0) = 0$。
</Solution>
</Question>
`;

    const rendered = await renderAndroidMarkdown(raw, {
      title: '函数性质',
      url: '/docs/math/01',
    });

    expect(rendered.startsWith('# 函数性质\n')).toBe(true);
    expect(rendered).not.toContain('(/docs/math/01)');
    expect(rendered).toContain(':::tip 提示\n\n注意定义域对称。\n\n:::');
    expect(rendered).toContain(':::question 题目 1 | 单选题 | 4分');
    expect(rendered).toContain('**标签：** 高数 · 基础');
    expect(rendered).toContain('A. $0$');
    expect(rendered).toContain('B. $1$');
    expect(rendered).toContain(':::solution 答案：A\n\n因为 $f(-0) = -f(0)$，所以 $f(0) = 0$。\n\n:::');
    expect(rendered.trimEnd().endsWith(':::')).toBe(true);
    expect(rendered.match(/^:::$/gm)?.length).toBe(3);
  });
});
