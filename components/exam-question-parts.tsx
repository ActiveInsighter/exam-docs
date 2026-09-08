import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

export type ExamContentProps = {
  children: ReactNode;
};

/**
 * Marks the short, directly consumable answer for an exercise.
 *
 * The wrapper deliberately renders no extra DOM. It is a semantic marker used
 * by ExamQuestion to expose the answer in the hover preview and the dialog.
 */
export function ExamAnswer({ children }: ExamContentProps) {
  return <>{children}</>;
}

/**
 * Marks the worked explanation for an exercise.
 *
 * Keeping this separate from ExamAnswer lets the compact preview stay useful
 * without forcing the reader to open the full explanation dialog.
 */
export function ExamExplanation({ children }: ExamContentProps) {
  return <>{children}</>;
}

export type ExamSolutionParts = {
  answer: ReactNode | null;
  explanation: ReactNode;
};

type ExamContentElement = ReactElement<ExamContentProps>;

function normalizeChildren(nodes: ReactNode[]): ReactNode {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return nodes;
}

function isContentMarker(
  node: ReactNode,
  marker: typeof ExamAnswer | typeof ExamExplanation,
): node is ExamContentElement {
  return isValidElement(node) && node.type === marker;
}

/**
 * Splits an ExamSolution into the answer preview and the full explanation.
 *
 * Documents written before the explicit markers existed still render: their
 * complete solution is treated as explanation and the answer preview is
 * simply omitted.
 */
export function splitExamSolution(children: ReactNode): ExamSolutionParts {
  let answer: ReactNode | null = null;
  let explanation: ReactNode | undefined;
  const legacyExplanation: ReactNode[] = [];

  for (const node of Children.toArray(children)) {
    if (isContentMarker(node, ExamAnswer)) {
      answer = node.props.children;
      continue;
    }

    if (isContentMarker(node, ExamExplanation)) {
      explanation = node.props.children;
      continue;
    }

    legacyExplanation.push(node);
  }

  return {
    answer,
    explanation: explanation ?? normalizeChildren(legacyExplanation),
  };
}
