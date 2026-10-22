import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import {
  getQuestionProblems,
  remarkQuestion,
  type QuestionNode,
} from '@/lib/remark-question';

const parser = unified().use(remarkParse).use(remarkMdx);

function parse(source: string) {
  return parser.parse(source) as QuestionNode;
}

function problemsOf(source: string) {
  return getQuestionProblems(parse(source)).map((problem) => problem.message);
}

function attributes(node: QuestionNode) {
  return Object.fromEntries(
    (node.attributes ?? []).map((attribute) => [
      attribute.name,
      typeof attribute.value === 'string' ? attribute.value : attribute.value?.value ?? true,
    ]),
  );
}

function questionsOf(tree: QuestionNode) {
  return (tree.children ?? []).filter((node) => node.name === 'Question');
}

const single = `<Question id="q1" type="single">

题干

<Option>甲</Option>
<Option correct>乙</Option>

<Solution>

解析

</Solution>

</Question>`;

describe('remarkQuestion', () => {
  it('removes heading semantics only inside Question blocks', () => {
    const tree = parse(`# 章节

<Question id="q1" type="essay">

## 题内标题

<Solution>

### 解答标题

</Solution>

</Question>
`);

    remarkQuestion()(tree);

    expect(tree.children?.[0].type).toBe('heading');
    const question = questionsOf(tree)[0];
    expect(question.children?.map((child) => child.type)).not.toContain('heading');
    expect(JSON.stringify(question)).not.toContain('"type":"heading"');
  });

  it('numbers questions in document order, honouring number overrides and hiding', () => {
    const tree = parse(`<Question id="a" type="essay">

甲

</Question>

<Question id="b" type="essay" number={15}>

乙

</Question>

<Question id="c" type="essay">

丙

</Question>

<Question id="d" type="essay" number={false}>

丁

</Question>

<Question id="e" type="essay">

戊

</Question>
`);

    remarkQuestion()(tree);

    expect(questionsOf(tree).map((question) => attributes(question).index)).toEqual([
      '1',
      '15',
      '16',
      undefined,
      '17',
    ]);
  });

  it('stamps a content revision that changes with the question text', () => {
    const revisionOf = (source: string) => {
      const tree = parse(source);
      remarkQuestion()(tree, { value: source });
      return attributes(questionsOf(tree)[0]).revision;
    };

    const first = revisionOf(single);
    expect(first).toMatch(/^[0-9a-f]{8}$/u);
    expect(revisionOf(single)).toBe(first);
    expect(revisionOf(single.replace('解析', '新的解析'))).not.toBe(first);
    expect(revisionOf(single.replace('<Question id="q1"', '<Question id="renamed"'))).toBe(first);
  });

  it('fails the compile with a readable message for an invalid question', () => {
    const tree = parse(single.replace('<Option correct>', '<Option>'));
    expect(() => remarkQuestion()(tree, { path: 'content/docs/x.mdx' })).toThrow(
      /content\/docs\/x\.mdx.*q1.*恰好有 1 个 correct/su,
    );
  });
});

describe('getQuestionProblems', () => {
  it('accepts every question type in its documented shape', () => {
    const source = [
      single,
      `<Question id="m" type="multiple">

题干

<Option correct>甲</Option>
<Option correct>乙</Option>
<Option>丙</Option>

</Question>`,
      `<Question id="b" type="boolean" answer={false}>

判断

<Solution>

说明

</Solution>

</Question>`,
      `<Question id="f" type="blank" points={2}>

位于 <Blank answer="传输层" aliases={["运输层"]} />，需要 <Blank answer={3} tolerance={0.5} /> 次握手。

</Question>`,
      `<Question id="e" type="essay" points={10} number="例 1">

简述进程与线程的区别。

<Solution>

参考答案

</Solution>

</Question>`,
    ].join('\n\n');

    expect(problemsOf(source)).toEqual([]);
  });

  it('requires a unique, well-formed id and a known type', () => {
    expect(problemsOf('<Question type="essay">\n\n题\n\n</Question>')).toEqual([
      expect.stringContaining('缺少 id'),
    ]);
    expect(problemsOf('<Question id="bad id" type="essay">\n\n题\n\n</Question>')).toEqual([
      expect.stringContaining('只能包含'),
    ]);
    expect(
      problemsOf('<Question id="x" type="essay">\n\n题\n\n</Question>\n\n<Question id="x" type="essay">\n\n题\n\n</Question>'),
    ).toEqual([expect.stringContaining('重复')]);
    expect(problemsOf('<Question id="x" type="cloze">\n\n题\n\n</Question>')).toEqual([
      expect.stringContaining('type 必须是'),
    ]);
  });

  it('checks the number of correct options per type', () => {
    expect(problemsOf(single.replace('<Option correct>', '<Option correct>').replace('<Option>甲', '<Option correct>甲'))).toEqual([
      expect.stringContaining('恰好有 1 个'),
    ]);
    expect(
      problemsOf(single.replace('type="single"', 'type="multiple"')),
    ).toEqual([expect.stringContaining('至少需要 2 个 correct')]);
    expect(problemsOf(single.replace(/<Option>甲<\/Option>\n/u, ''))).toEqual([
      expect.stringContaining('至少需要 2 个 Option'),
    ]);
  });

  it('requires options to be direct, contiguous children', () => {
    const nested = single.replace(
      '<Option>甲</Option>\n<Option correct>乙</Option>',
      '- <Option>甲</Option>\n- <Option correct>乙</Option>',
    );
    expect(problemsOf(nested)).toContainEqual(expect.stringContaining('直接子元素'));

    const split = single.replace('<Option correct>乙</Option>', '\n插入说明\n\n<Option correct>乙</Option>');
    expect(problemsOf(split)).toContainEqual(expect.stringContaining('连续'));
  });

  it('requires Solution to be the last direct child, and only one', () => {
    const trailing = single.replace('</Solution>', '</Solution>\n\n题后补充');
    expect(problemsOf(trailing)).toContainEqual(expect.stringContaining('最后'));

    const twice = single.replace('</Solution>', '</Solution>\n\n<Solution>\n\n另一个\n\n</Solution>');
    expect(problemsOf(twice)).toContainEqual(expect.stringContaining('只能有一个 Solution'));
  });

  it('validates boolean, blank and essay specifics', () => {
    expect(problemsOf('<Question id="b" type="boolean">\n\n题\n\n</Question>')).toEqual([
      expect.stringContaining('answer={true}'),
    ]);
    expect(problemsOf('<Question id="s" type="essay" answer={true}>\n\n题\n\n</Question>')).toEqual([
      expect.stringContaining('只有判断题'),
    ]);
    expect(problemsOf('<Question id="f" type="blank">\n\n没有空\n\n</Question>')).toEqual([
      expect.stringContaining('至少需要 1 个'),
    ]);
    expect(problemsOf('<Question id="f" type="blank">\n\n空 <Blank answer="" />\n\n</Question>')).toEqual([
      expect.stringContaining('非空的 answer'),
    ]);
    expect(problemsOf('<Question id="e" type="essay">\n\n题\n\n<Option>甲</Option>\n\n</Question>')).toContainEqual(
      expect.stringContaining('不能包含 Option'),
    );
    expect(problemsOf('<Question id="e" type="essay" points="x">\n\n题\n\n</Question>')).toEqual([
      expect.stringContaining('points'),
    ]);
  });

  it('validates blank kinds and maths answers', () => {
    expect(problemsOf('<Question id="m" type="blank">\n\n值 <Blank answer="x^2+1" kind="math" /> 与 <Blank answer="3" />\n\n</Question>')).toEqual([]);
    expect(problemsOf('<Question id="m" type="blank">\n\n值 <Blank answer={"sqrt(2)/2"} kind="math" />\n\n</Question>')).toEqual([]);
    expect(problemsOf('<Question id="m" type="blank">\n\n值 <Blank answer="(1+" kind="math" />\n\n</Question>')).toEqual([
      expect.stringContaining('无法解析'),
    ]);
    expect(problemsOf('<Question id="m" type="blank">\n\n值 <Blank answer="1" kind="number" />\n\n</Question>')).toEqual([
      expect.stringContaining('kind'),
    ]);
  });

  it('accepts built-in tags as a comma list or a string array', () => {
    expect(problemsOf('<Question id="t" type="essay" tags="2023 统考, 易错">\n\n题\n\n</Question>')).toEqual([]);
    expect(problemsOf('<Question id="t" type="essay" tags={["来源:2023 统考", "易错"]}>\n\n题\n\n</Question>')).toEqual([]);
    expect(problemsOf('<Question id="t" type="essay" tags={[1, 2]}>\n\n题\n\n</Question>')).toEqual([
      expect.stringContaining('tags'),
    ]);
    expect(problemsOf(`<Question id="t" type="essay" tags="${'a,'.repeat(9)}">\n\n题\n\n</Question>`)).toEqual([
      expect.stringContaining('最多 8 个'),
    ]);
  });

  it('points authors at the new components when a legacy tag is used', () => {
    expect(
      problemsOf('<Question id="e" type="essay">\n\n<ExamSolution>\n\n旧\n\n</ExamSolution>\n\n</Question>'),
    ).toContainEqual(expect.stringContaining('旧组件'));
  });
});
