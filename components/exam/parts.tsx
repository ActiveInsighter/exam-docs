import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

/*
 * Server-safe helpers shared by the exam components. Everything here works on
 * already compiled MDX React nodes, so authored documents never need to repeat
 * data (answer letters, option labels) in props.
 */

export type ExamContentProps = {
  children?: ReactNode;
};

/**
 * Marks the short, directly consumable answer for an exercise. Renders no DOM;
 * ExamQuestion reads it for the answer preview, grading and the dialog.
 */
export function ExamAnswer({ children }: ExamContentProps) {
  return <>{children}</>;
}

/** Marks the worked explanation for an exercise. */
export function ExamExplanation({ children }: ExamContentProps) {
  return <>{children}</>;
}

/** Marks one option inside <ExamChoices>. */
export function ExamOption({ children }: ExamContentProps) {
  return <>{children}</>;
}

type PropsWithChildren = { children?: ReactNode; className?: unknown };

function isMarker<P>(
  node: ReactNode,
  marker: (props: P) => ReactNode,
): node is ReactElement<P> {
  return isValidElement(node) && node.type === marker;
}

export function isExamOption(node: ReactNode): node is ReactElement<ExamContentProps> {
  return isMarker(node, ExamOption);
}

export type ExamSolutionParts = {
  answer: ReactNode | null;
  explanation: ReactNode;
};

function normalizeChildren(nodes: ReactNode[]): ReactNode {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return nodes;
}

/**
 * Splits an ExamSolution into the answer and the full explanation. Legacy
 * solutions without explicit markers are treated as explanation only.
 */
export function splitExamSolution(children: ReactNode): ExamSolutionParts {
  let answer: ReactNode | null = null;
  let explanation: ReactNode | undefined;
  const legacyExplanation: ReactNode[] = [];

  for (const node of Children.toArray(children)) {
    if (isMarker(node, ExamAnswer)) {
      answer = node.props.children;
      continue;
    }

    if (isMarker(node, ExamExplanation)) {
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

export function hasContent(node: ReactNode) {
  return node !== null && node !== undefined && node !== false && node !== '';
}

function getClassName(node: ReactElement<PropsWithChildren>) {
  return typeof node.props.className === 'string' ? node.props.className : '';
}

/**
 * Visible text of a compiled MDX node. KaTeX renders every formula twice
 * (MathML for assistive tech + HTML for display); only the HTML half is read.
 */
export function getNodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (!isValidElement<PropsWithChildren>(node)) return '';
  if (/(?:^|\s)katex-mathml(?:\s|$)/u.test(getClassName(node))) return '';
  return getNodeText(node.props.children);
}

const ANSWER_KEY_PATTERN =
  /^[（(]?\s*([A-H](?:\s*[、,，]?\s*[A-H])*)\s*[)）]?(?=$|[\s。．.，,；;：:（(]|即)/u;

/**
 * Reads the option letters from an authored answer such as "A", "ACD",
 * "（B）", "B。", "C，即 …" or "$\mathrm{D}$". Free-form answers (for example
 * "原选项中无正确项" or multi-part "(1) C；(2) D") return null, which keeps the
 * question non-graded instead of guessing.
 */
export function parseAnswerKey(answer: ReactNode): string[] | null {
  const text = getNodeText(answer).replace(/\s+/gu, ' ').trim();
  const match = ANSWER_KEY_PATTERN.exec(text);
  if (!match) return null;

  const letters = Array.from(new Set(match[1].replace(/[^A-H]/gu, '')));
  return letters.length > 0 ? letters.sort() : null;
}

const OPTION_LABEL_PATTERN =
  /^\s*(?:[（(]\s*([A-H])\s*[)）]|([A-H])\s*[.．、:：])\s*/u;

export type SplitOption = {
  label: string | null;
  content: ReactNode;
};

function stripLeadingLabel(node: ReactNode): SplitOption | null {
  if (typeof node === 'string') {
    const match = OPTION_LABEL_PATTERN.exec(node);
    if (!match) return null;
    return { label: match[1] ?? match[2], content: node.slice(match[0].length) };
  }

  if (Array.isArray(node)) {
    const index = node.findIndex(
      (child) => !(typeof child === 'string' && child.trim() === ''),
    );
    if (index === -1) return null;

    const stripped = stripLeadingLabel(node[index]);
    if (!stripped) return null;

    const content = [...node];
    content[index] = stripped.content;
    return { label: stripped.label, content: content.slice(index) };
  }

  // Descend only into plain host wrappers (<p>, <strong>, …). Components and
  // KaTeX spans keep their markup untouched.
  if (
    isValidElement<PropsWithChildren>(node) &&
    typeof node.type === 'string' &&
    !/(?:^|\s)katex/u.test(getClassName(node))
  ) {
    const stripped = stripLeadingLabel(node.props.children);
    if (!stripped) return null;
    return {
      label: stripped.label,
      content: cloneElement(node, { children: stripped.content }),
    };
  }

  return null;
}

/**
 * Separates the authored "A. " prefix from an option so the letter can be
 * rendered as a marker. Options without a recognisable prefix stay intact.
 */
export function splitOptionLabel(node: ReactNode): SplitOption {
  return stripLeadingLabel(node) ?? { label: null, content: node };
}

function isWhitespaceNode(node: ReactNode) {
  return typeof node === 'string' && node.trim() === '';
}

/** Option contents of an <ExamChoices>, accepting legacy unmarked children. */
export function getChoiceOptionNodes(children: ReactNode): ReactNode[] {
  const nodes = Children.toArray(children).filter((node) => !isWhitespaceNode(node));
  const marked = nodes.filter(isExamOption);
  return marked.length > 0 ? marked.map((option) => option.props.children) : nodes;
}

export function getOptionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

/** Display letters of an option list: authored prefix, else positional. */
export function getOptionLabels(options: readonly ReactNode[]) {
  return options.map(
    (option, index) => splitOptionLabel(option).label ?? getOptionLetter(index),
  );
}
