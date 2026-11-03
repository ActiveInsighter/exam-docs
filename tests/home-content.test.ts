import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { featuredQuestions } from '@/lib/home/content';
import { extractQuestion, stripSourceTag, tidyCjkSpacing } from '@/lib/home/question-source';

const sample = `
<Question id="other" type="single">
别的题目
<Option correct>x</Option>
<Option>y</Option>
</Question>

<Question id="demo-1" type="single" points={2} tags="来源:模拟">

**【2009】** 栈的容量至少是（ ）。

<Option>1</Option>
<Option correct>2</Option>
<Option correct={true}>$O(n)$</Option>
<Option>4</Option>

<Solution>
<Option correct>not an option</Option>
</Solution>
</Question>
`;

describe('home question extraction', () => {
  it('reads the stem and options of the requested question only', () => {
    const question = extractQuestion(sample, 'demo-1');
    expect(question).not.toBeNull();
    expect(question?.type).toBe('single');
    expect(question?.stem).toBe('**【2009】** 栈的容量至少是（ ）。');
    expect(question?.options.map((option) => option.text)).toEqual(['1', '2', '$O(n)$', '4']);
    expect(question?.options.map((option) => option.correct)).toEqual([false, true, true, false]);
  });

  it('returns null for an unknown id', () => {
    expect(extractQuestion(sample, 'missing')).toBeNull();
  });

  it('strips the leading source tag and stray spaces before Chinese punctuation', () => {
    expect(stripSourceTag('**【1993-2-3 分】** 当 $x$ 趋于 0 时')).toBe('当 $x$ 趋于 0 时');
    expect(stripSourceTag('【2009】设栈 S')).toBe('设栈 S');
    expect(tidyCjkSpacing('e、f 、g，则栈S 的容量')).toBe('e、f、g，则栈S 的容量');
  });
});

describe('featured home questions', () => {
  it.each(featuredQuestions.map((ref) => [ref.id, ref] as const))('%s resolves to a single-answer question', (_id, ref) => {
    const mdx = readFileSync(resolve(process.cwd(), 'content/docs', ref.file), 'utf8');
    const question = extractQuestion(mdx, ref.id);
    expect(question, `${ref.id} not found in ${ref.file}`).not.toBeNull();
    expect(question?.type).toBe('single');
    expect(question?.options.length).toBeGreaterThanOrEqual(2);
    expect(question?.options.filter((option) => option.correct)).toHaveLength(1);
  });
});
