import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderStaticMarkdown } from '../scripts/static-docs-markdown.mjs';
import { getLLMText } from '../lib/get-llm-text';

const metadata = { title: '练习', url: '/docs/practice' };

describe('question Markdown export', () => {
  it('keeps question identity, type, categorized tags, points and inline answer markers', async () => {
    const result = await renderStaticMarkdown([
      '<Question id="stack-1" type="single" number={15} points={5} tags="来源:408 统考 2019，章节:栈与队列、易错">',
      '栈的容量至少为多少？',
      '<Option correct={false}>2</Option>',
      '<Option correct={true}>3</Option>',
      '<Solution>需要保存三个元素。</Solution>',
      '</Question>',
    ].join('\n'), metadata);
    expect(result).toContain('**题目 15**');
    expect(result).toContain('**题目 ID：** stack-1');
    expect(result).toContain('**题型：** 单选题 (single)');
    expect(result).toContain('**标签：** 来源:408 统考 2019；章节:栈与队列；易错');
    expect(result).toContain('**分值：** 5');
    expect(result).toContain('A. 2');
    expect(result).toContain('B. 3');
    expect(result).toContain('**答案：** B');
    expect(result).toContain('**解析：**\n\n需要保存三个元素。');
    expect(result).not.toMatch(/<\/?(?:Question|Option|Solution)\b/);
  });

  it('handles multiline props, JSON tag arrays and quoted > characters without leaking props', async () => {
    const result = await renderStaticMarkdown([
      '<Question',
      ' id="multi-1"',
      ' type="multiple"',
      ' number={7}',
      ' tags={["来源:模拟题", "条件:a > b", "易错", "易错"]}',
      '>',
      '选择正确的式子。',
      '<Option correct>甲</Option><Option>乙</Option><Option correct>丙</Option>',
      '<Solution>甲和丙正确。</Solution>',
      '</Question>',
      '<Question id="next" type="essay"><Solution>参考作答。</Solution></Question>',
    ].join('\n'), metadata);
    expect(result).toContain('**标签：** 来源:模拟题；条件:a \\> b；易错');
    expect(result).toContain('**答案：** AC');
    expect(result).toContain('**题目 8**');
    expect(result).not.toContain('tags=');
    expect(result).not.toContain('number=');
    expect(result).not.toContain('<Question');
  });

  it('follows numbering resets, custom labels and hidden numbers without advancing the counter', async () => {
    const result = await renderStaticMarkdown([
      '<Question id="a" type="essay" number={4}>甲</Question>',
      '<Question id="b" type="essay" number={false}>乙</Question>',
      '<Question id="c" type="essay" number="例 1">丙</Question>',
      '<Question id="d" type="essay">丁</Question>',
    ].join('\n'), metadata);
    expect(result).toContain('**题目 4**');
    expect(result).toContain('**题目**\n\n**题目 ID：** b');
    expect(result).toContain('**题目 例 1**');
    expect(result).toContain('**题目 5**');
  });

  it('exports boolean answers and blank answers with accepted aliases', async () => {
    const result = await renderStaticMarkdown([
      '<Question id="bool" type="boolean" answer={false}>这个说法正确吗？</Question>',
      '<Question id="blank" type="blank" tags={"章节:网络"}>',
      'TCP 位于 <Blank',
      ' answer="传输层" aliases={["运输层"]}',
      '/>，需要 <Blank answer={"3"} /> 次握手。',
      '<Solution>按协议定义判断。</Solution></Question>',
    ].join('\n'), metadata);
    expect(result).toContain('**答案：** 错误');
    expect(result).toContain('TCP 位于 ____，需要 ____ 次握手。');
    expect(result).toContain('**答案：** 传输层（亦可：运输层）；3');
    expect(result).toContain('**标签：** 章节:网络');
  });

  it('keeps reading article metadata and evidence text', async () => {
    const result = await renderStaticMarkdown([
      '<ExamArticle',
      ' title="Attention &amp; Learning" titleTranslation="注意力与学习" source="来源：2024 阅读材料">',
      '<p>We <Evidence for="reading-1">learn through practice</Evidence>.</p>',
      '</ExamArticle>',
    ].join('\n'), metadata);
    expect(result).toContain('**Attention & Learning**');
    expect(result).toContain('**译题：** 注意力与学习');
    expect(result).toContain('**来源：** 来源：2024 阅读材料');
    expect(result).toContain('We learn through practice.');
    expect(result).not.toContain('Evidence');
  });

  it('leaves code examples intact and never evaluates dynamic prop expressions', async () => {
    const code = '<Question id="sample" type="single" tags="示例" />';
    const result = await renderStaticMarkdown([
      '```mdx', code, '```',
      `行内示例：\`${code}\`。`,
      '<Question id="real" type="essay" tags={(globalThis.__exportExecuted = true)}>正文</Question>',
    ].join('\n'), metadata);
    expect(result).toContain('```mdx\n' + code + '\n```');
    expect(result).toContain('`' + code + '`');
    expect(result).toContain('**题目 1**');
    expect(result).not.toContain('globalThis');
    expect('__exportExecuted' in globalThis).toBe(false);
  });

  it('keeps multiline practice callout titles and card descriptions', async () => {
    const result = await renderStaticMarkdown([
      '<Callout', ' type="info" title="来源:2024 真题 · 巩固练习">',
      '题干与解析', '</Callout>',
      '<Card', ' title="本章练习" description="分类：极限与连续"', '>继续练习</Card>',
    ].join('\n'), metadata);
    expect(result).toContain('**来源:2024 真题 · 巩固练习**');
    expect(result).toContain('**本章练习**');
    expect(result).toContain('分类：极限与连续');
    expect(result).toContain('题干与解析');
    expect(result).not.toContain('title=');
  });

  it('preserves nested fences and ignores question-like strings inside unrelated component props', async () => {
    const code = '````mdx\n```tsx\n<Question id="sample" type="essay">示例</Question>\n```\n````';
    const result = await renderStaticMarkdown([
      code,
      '<MathPlot2D title={\'<Question id="fake" type="essay">\'} />',
      '<Question id="real" type="essay">正文</Question>',
    ].join('\n'), metadata);
    expect(result).toContain(code);
    expect(result).toContain('**题目 1**');
    expect(result).not.toContain('**题目 ID：** fake');
    expect(result).not.toContain('**题目 2**');
  });

  it('does not lose later questions after an unmatched inline backtick', async () => {
    const result = await renderStaticMarkdown([
      '<Question id="first" type="essay">',
      '<Solution>补码 `n=F6H，位模式是 `90H`。</Solution>',
      '</Question>', '',
      '<Question id="second" type="essay" tags="来源:真题">',
      '```c', 'int x = 1;', '```',
      '<Solution>参考解析。</Solution>', '</Question>',
    ].join('\n'), metadata);
    expect(result).toContain('**题目 ID：** second');
    expect(result).toContain('**标签：** 来源:真题');
    expect(result).toContain('```c\nint x = 1;\n```');
    expect(result).not.toContain('<Question');
  });

  it('runs from an isolated application lib directory without build scripts', async () => {
    const stage = await mkdtemp(path.join(process.cwd(), '.markdown-export-test-'));
    try {
      await cp(path.join(process.cwd(), 'lib'), path.join(stage, 'lib'), { recursive: true });
      const result = execFileSync(process.execPath, ['--input-type=module', '-e', [
        "import { renderStaticMarkdown } from './lib/markdown-export.mjs';",
        "const raw = '<Question id=\"stage\" type=\"essay\" tags=\"来源:真题\">正文</Question>';",
        "console.log(await renderStaticMarkdown(raw, { title: '练习', url: '/docs/practice' }));",
      ].join('\n')], { cwd: stage, encoding: 'utf8' });
      expect(result).toContain('**题目 ID：** stage');
      expect(result).toContain('**标签：** 来源:真题');
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  });

  it('serves the same metadata-rich Markdown through the LLM route and static exporter', async () => {
    const raw = '---\ntitle: 练习\n---\n<Question id="q" type="essay" tags="来源:真题"><Solution>解析</Solution></Question>';
    const getText = vi.fn(async (kind: string) => kind === 'raw' ? raw : 'props were lost');
    const page = { data: { title: metadata.title, getText }, url: metadata.url };
    const result = await getLLMText(page as unknown as Parameters<typeof getLLMText>[0]);
    expect(getText).toHaveBeenCalledWith('raw');
    expect(result).toBe(await renderStaticMarkdown(raw, metadata));
    expect(result).toContain('**标签：** 来源:真题');
  });
});
