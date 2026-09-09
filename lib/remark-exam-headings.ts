type ExamMdxNode = {
  type?: string;
  name?: string | null;
  depth?: number;
  children?: ExamMdxNode[];
};

function visitExamContent(node: ExamMdxNode, insideExamQuestion: boolean) {
  const nextInsideExamQuestion =
    insideExamQuestion ||
    (node.type === 'mdxJsxFlowElement' && node.name === 'ExamQuestion');

  if (nextInsideExamQuestion && node.type === 'heading') {
    node.type = 'paragraph';
    delete node.depth;
  }

  for (const child of node.children ?? []) {
    visitExamContent(child, nextInsideExamQuestion);
  }
}

/**
 * Prevent Markdown headings authored inside <ExamQuestion> blocks from leaking
 * into Fumadocs' generated table of contents. The visible text is preserved;
 * only heading semantics are removed before remarkStructure collects headings.
 */
export function remarkExamHeadings() {
  return (tree: ExamMdxNode) => {
    visitExamContent(tree, false);
  };
}
