import { describe, expect, it } from 'vitest';
import { isTexAnswer, renderTexAnswer } from '@/lib/blank-answer-tex';
import { remarkQuestion, type QuestionNode } from '@/lib/remark-question';

describe('LaTeX keys of text blanks', () => {
  it('recognises LaTeX but leaves words and calculator input alone', () => {
    expect(isTexAnswer('(0,\\dfrac{\\sqrt3}{3})')).toBe(true);
    expect(isTexAnswer('C_1 e^x + C_2 e^{3x}')).toBe(true);
    expect(isTexAnswer('-y_1^2 - y_2^2')).toBe(true);
    expect(isTexAnswer('传输层')).toBe(false);
    expect(isTexAnswer('2^(n-1)*n!')).toBe(false);
    expect(isTexAnswer('(x-1)*e^x+e^(-x)')).toBe(false);
    expect(isTexAnswer('x=k(1,1,1)^T，k 为任意常数')).toBe(false);
  });

  it('typesets with KaTeX, keeping Chinese words as text', () => {
    const html = renderTexAnswer('k(2, -1, 1)^{T}, 其中 k 为任意常数')!;
    expect(html).toContain('class="katex"');
    expect(html).toContain('其中');
    expect(renderTexAnswer('\\frac{1}{')).toBeNull();
    expect(renderTexAnswer('传输层')).toBeNull();
  });

  it('adds answerHtml to text blanks only', () => {
    const blank = (answer: string, kind?: string): QuestionNode => ({
      type: 'mdxJsxTextElement',
      name: 'Blank',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'answer', value: answer },
        ...(kind ? [{ type: 'mdxJsxAttribute' as const, name: 'kind', value: kind }] : []),
      ],
    });
    const tex = blank('\\sigma^2', 'text');
    const words = blank('传输层');
    const math = blank('x^2', 'math');
    const tree: QuestionNode = {
      type: 'root',
      children: [{
        type: 'mdxJsxFlowElement',
        name: 'Question',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'id', value: 'q1' },
          { type: 'mdxJsxAttribute', name: 'type', value: 'blank' },
        ],
        children: [{ type: 'paragraph', children: [tex, words, math] }],
      }],
    };
    remarkQuestion()(tree);
    const html = (node: QuestionNode) => node.attributes?.find((attribute) => attribute.name === 'answerHtml')?.value;
    expect(html(tex)).toContain('class="katex"');
    expect(html(words)).toBeUndefined();
    expect(html(math)).toBeUndefined();
  });
});
