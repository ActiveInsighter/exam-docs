import { describe, expect, it } from 'vitest';
import { remarkExamHeadings } from '@/lib/remark-exam-headings';

describe('remarkExamHeadings', () => {
  it('removes heading semantics only inside ExamQuestion blocks', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 2,
          children: [{ type: 'text', value: 'Section' }],
        },
        {
          type: 'mdxJsxFlowElement',
          name: 'ExamQuestion',
          children: [
            {
              type: 'heading',
              depth: 3,
              children: [{ type: 'text', value: 'Question heading' }],
            },
            {
              type: 'mdxJsxFlowElement',
              name: 'ExamSolution',
              children: [
                {
                  type: 'heading',
                  depth: 4,
                  children: [{ type: 'text', value: 'Solution heading' }],
                },
              ],
            },
          ],
        },
      ],
    };

    remarkExamHeadings()(tree);

    expect(tree.children[0]).toMatchObject({ type: 'heading', depth: 2 });
    expect(tree.children[1].children?.[0]).toMatchObject({ type: 'paragraph' });
    expect(tree.children[1].children?.[0]).not.toHaveProperty('depth');
    expect(tree.children[1].children?.[1].children?.[0]).toMatchObject({
      type: 'paragraph',
    });
    expect(tree.children[1].children?.[1].children?.[0]).not.toHaveProperty(
      'depth',
    );
  });
});
