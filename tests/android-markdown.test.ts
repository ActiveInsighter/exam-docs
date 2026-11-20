import { describe, expect, it } from 'vitest';
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
    expect(result).toContain(':::question {id="q1" type="single" number="1"}');
    expect(result).toContain(':::option {label="A" correct="true"}');
    expect(result).toContain(':::solution 参考答案与解析\n\n**答案：** A');
    expect(result).toContain(':::warning 检查条件\n\n保留公式 $x^2$。');
    expect(result).toContain('~~~md\n:::warning code example\n~~~');

    const ai = await renderStaticMarkdown(source, { title: '练习', url: '/docs/exercise' });
    expect(ai).toContain('# 练习 (/docs/exercise)');
    expect(ai).toContain('**题目 ID：** q1');
    expect(ai).not.toContain(':::solution');
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
});
