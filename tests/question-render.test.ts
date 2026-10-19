import { evaluate } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import { Blank, Option, Question, Solution } from '@/components/question';
import { remarkQuestion } from '@/lib/remark-question';

async function render(source: string, path = 'test.mdx') {
  const { default: Content } = await evaluate(
    { value: source, path },
    {
      ...runtime,
      remarkPlugins: [remarkQuestion, remarkMath],
      rehypePlugins: [[rehypeKatex, { strict: 'ignore', output: 'html' }]],
    },
  );
  return renderToStaticMarkup(
    createElement(Content, { components: { Question, Option, Blank, Solution } }),
  );
}

const doc = (path: string) =>
  readFileSync(join(process.cwd(), 'content/docs', path), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');

describe('question documents through the real MDX pipeline', () => {
  it('turns consecutive <Option> lines into a graded choice group', async () => {
    const html = await render(`<Question id="q1" type="single">

算法的基本特征不包括（ ）。

<Option>有穷性</Option>
<Option>确定性</Option>
<Option>可行性</Option>
<Option correct>可读性</Option>

<Solution>

可读性不是算法必须具备的基本特征。

</Solution>

</Question>`);

    expect(html).toContain('data-question-id="q1"');
    expect(html).toMatch(/data-question-revision="[0-9a-f]{8}"/u);
    expect(html).toContain('>1.</span>');
    expect(html.match(/data-exam-choice-option=""/gu)).toHaveLength(4);
    expect(html.match(/aria-pressed="false"/gu)).toHaveLength(4);
    expect(html).toContain('>D</span>');
    expect(html).not.toContain('可读性不是算法必须具备');
  });

  it('renders a blank question with inputs inside the stem', async () => {
    const html = await render(`<Question id="q2" type="blank">

TCP 位于 <Blank answer="传输层" />，建立连接需要 <Blank answer="3" /> 次握手。

<Solution>

三次握手。

</Solution>

</Question>`);

    expect(html.match(/data-question-blank=""/gu)).toHaveLength(2);
    expect(html).toContain('aria-label="第 2 空"');
    expect(html).toContain('提交答案');
  });

  it('renders migrated 408, mathematics and English documents', async () => {
    const mock = await render(doc('408/mock/01-数据结构/01-绪论.mdx'));
    expect(mock.match(/data-question-type="single"/gu)?.length).toBeGreaterThan(5);
    expect(mock).not.toContain('<Option');

    const math = await render(doc('math/core-questions/01-高等数学/01-模块一-函数、极限与连续/02-第二节-极限的基本性质.mdx'));
    expect(math).toContain('data-question-type="boolean"');
    expect(math).toContain('data-question-type="essay"');
    expect(math).toContain('katex');

    const english = await render(doc('english/index.mdx'), 'english.mdx').catch((error) => String(error));
    // <EnglishReading> is not part of this harness; the questions must still validate.
    expect(english).not.toMatch(/题目写法有误/u);
  });
});
