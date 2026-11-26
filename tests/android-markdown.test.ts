import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { remarkQuestion, type QuestionNode } from '../lib/remark-question';
import { renderAndroidMarkdown, renderStaticMarkdown } from '../lib/markdown-export.mjs';

describe('Android Markdown export', () => {
  it('preserves authored Markdown and emits native containers for answers and callouts', async () => {
    const source = [
      '---', 'title: 练习', '---', '# 练习', '', '<Question id="q1" type="single">',
      '求 $x$。', '<Option correct>A 的内容</Option>', '<Solution>',
      '<Callout type="warn" title="检查条件">保留公式 $x^2$。</Callout>',
      '</Solution>', '</Question>', '', '~~~md', ':::warning code example', '~~~',
    ].join('\n');
    const result = renderAndroidMarkdown(source, { title: '练习' });
    expect(result).toMatch(/^# 练习\n/);
    expect(result.match(/^# 练习$/gm)).toHaveLength(1);
    expect(result).toMatch(/:::question \{id="q1" revision="[a-f0-9]{8}" type="single" number="1"\}/u);
    expect(result).toContain(':::option {label="A" correct="true"}');
    expect(result).toContain(':::solution 参考答案与解析\n\n**答案：** A');
    expect(result).toContain(':::warning 检查条件\n\n保留公式 $x^2$。');
    expect(result).toContain('~~~md\n:::warning code example\n~~~');

    const ai = await renderStaticMarkdown(source, { title: '练习', url: '/docs/exercise' });
    expect(ai).toContain('# 练习 (/docs/exercise)');
    expect(ai).toContain('**题目 ID：** q1');
    expect(ai).not.toContain(':::solution');
  });

  it('preserves the web revision for a versioned question', () => {
    const body = [
      '<Question id="shared" type="boolean" answer={true}>',
      '',
      '若 $0<x<n$，则 $x$ 小于 $n$。',
      '',
      '</Question>',
    ].join('\n');
    const tree = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).use(remarkMath).parse(body) as QuestionNode;
    remarkQuestion()(tree, { value: body });
    const revision = tree.children?.[0]?.attributes?.find((item) => item.name === 'revision')?.value;
    expect(revision).toMatch(/^[a-f0-9]{8}$/u);
    expect(renderAndroidMarkdown('---\ntitle: 练习\n---\n' + body, { title: '练习' }))
      .toContain(`id="shared" revision="${revision}"`);
  });

  it('keeps comparisons and indented fences from swallowing component boundaries', () => {
    const source = [
      '若 $0<x<n$，则继续。',
      '',
      '<Callout type="info">保留说明</Callout>',
      '',
      '  ~~~md',
      '<Callout>保留代码示例</Callout>',
      '  ~~~',
    ].join('\n');
    const result = renderAndroidMarkdown(source, { title: '比较' });
    expect(result).toContain('若 $0<x<n$，则继续。');
    expect(result).toContain(':::info\n\n保留说明\n\n:::');
    expect(result).toContain('  ~~~md\n<Callout>保留代码示例</Callout>\n  ~~~');
  });

  it('keeps negative and plus-prefixed option text out of Markdown list syntax', () => {
    const source = [
      '<Question id="neg" type="single">',
      '取值范围是（ ）',
      '<Option>-128 ∼127</Option>',
      '<Option correct>-512 ∼511</Option>',
      '<Option>\\+ x/ y - zuv</Option>',
      '<Option>xyzu - v/ +</Option>',
      '<Solution>看符号位。</Solution>',
      '</Question>',
    ].join('\n');
    const result = renderAndroidMarkdown(source, { title: '符号' });
    // A hyphen glued to the digits stays literal; a hyphen followed by a space
    // would be parsed as a bullet list item by Markdown readers.
    expect(result).not.toMatch(/^-[ \t]+(?:\d|\\\+)/mu);
    expect(result).not.toMatch(/^\+[ \t]+\S/mu);
    expect(result).toContain('\n-128 ∼127\n');
    expect(result).toContain('\n-512 ∼511\n');
  });

  it('numbers every page from 1 without restarts or gaps', () => {
    const source = [
      '<Question id="a" type="single"><Option correct>甲</Option><Option>乙</Option><Solution>甲</Solution></Question>',
      '<Question id="b" type="single"><Option correct>甲</Option><Option>乙</Option><Solution>甲</Solution></Question>',
      '<Question id="c" type="single"><Option correct>甲</Option><Option>乙</Option><Solution>甲</Solution></Question>',
    ].join('\n\n');
    const result = renderAndroidMarkdown(source, { title: '编号' });
    const numbers = [...result.matchAll(/^:::question .*number="(\d+)"/gmu)].map((match) => Number(match[1]));
    expect(numbers).toEqual([1, 2, 3]);
  });

  it('exports Steps, Cards and Tabs for Android', () => {
    const source = [
      '<Steps><Step title="一">内容</Step></Steps>',
      '<Cards><Card icon="rocket" tone="info" title="卡片" description="说明" /></Cards>',
      '<CodeBlockTabs><CodeBlockTab value="npm">\n\n```bash\nnpm i\n```\n\n</CodeBlockTab></CodeBlockTabs>',
    ].join('\n\n');
    const result = renderAndroidMarkdown(source, { title: '组件' });
    expect(result).toContain(':::steps');
    expect(result).toContain(':::step 一');
    expect(result).toContain(':::cards');
    expect(result).toContain(':::card {icon="rocket" tone="info"} 卡片');
    expect(result).toContain(':::codetabs');
    expect(result).toContain(':::tab npm');
  });
  it('normalizes authored callouts and preserves solution diagrams and their captions', () => {
    const result = renderAndroidMarkdown([
      ':::tip[提示]', '先画图。', ':::', '',
      '<AlgoFigure src="/img/示意图 (1)" alt="二叉树" caption="遍历顺序" />',
    ].join('\n'), { title: '图示' });
    expect(result).toContain(':::tip 提示\n先画图。\n:::');
    expect(result).toContain('![二叉树](</img/示意图 (1).svg>)\n\n遍历顺序');
  });
  it('resolves relative document and card links using the published source path', () => {
    const result = renderAndroidMarkdown([
      '[导论](./导论/#例题)',
      '<Card title="导论" href="./导论/" />',
      '示例：`[导论](./导论/)`',
    ].join('\n\n'), {
      title: '目录',
      sourcePath: 'politics/classified-questions/marxism-principles/index.mdx',
    });
    expect(result).toContain('[导论](/docs/politics/classified-questions/marxism-principles/s-295feb10#例题)');
    expect(result).toContain('href="/docs/politics/classified-questions/marxism-principles/s-295feb10"');
    expect(result).toContain('`[导论](./导论/)`');
  });
  it('exports image markup, spaced math, and structured fill-in answers', () => {
    const source = [
      '<Question type="blank">',
      '若 $ f(x)$ 满足 $ 0<x<2 $，求 <Blank answer="\\frac{1}{2}" aliases={[\'0.5\', \'1/2\']} kind="math" />。',
      '<Solution><img src="/img/示意图 (1).svg" alt="图 &amp; 例" />',
      '![网页附图](https://cdn.example.test/figure.webp)',
      '<a href="/details"><img src="/images/chart.jpg" alt="缩略图" /></a></Solution>',
      '</Question>',
      '代码：`$ x $`',
      '~~~html', '<img src="/sample.png">', '~~~',
    ].join('\n');
    const result = renderAndroidMarkdown(source, { title: '图片和公式' });
    expect(result).toContain('若 $f(x)$ 满足 $0<x<2$');
    expect(result).toContain('![图 & 例](</img/示意图 (1).svg>)');
    expect(result).toContain('![网页附图](https://cdn.example.test/figure.webp)');
    expect(result).toContain('[![缩略图](</images/chart.jpg>)](</details>)');
    expect(result).toContain('`$ x $`');
    expect(result).toContain('~~~html\n<img src="/sample.png">\n~~~');
    const blanks = /^:::question .*blanks="((?:[^"\\]|\\.)*)"/m.exec(result)?.[1];
    expect(blanks).toBeDefined();
    expect(JSON.parse(blanks!.replace(/\\(["\\])/g, '$1')))
      .toEqual([{ answer: '\\frac{1}{2}', aliases: ['0.5', '1/2'], kind: 'math' }]);
  });
});
