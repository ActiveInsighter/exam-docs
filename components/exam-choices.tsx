import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import styles from './exam-question.module.css';

export type ChoiceDensity = 'compact' | 'regular' | 'long';

type ExamOptionProps = {
  children: ReactNode;
};

export function ExamOption({ children }: ExamOptionProps) {
  return <>{children}</>;
}

type ExamOptionElement = ReactElement<ExamOptionProps, typeof ExamOption>;

function isExamOption(node: ReactNode): node is ExamOptionElement {
  return isValidElement<ExamOptionProps>(node) && node.type === ExamOption;
}

function getNodeTextLength(node: ReactNode): number {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return 0;
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).trim().length;
  }

  if (Array.isArray(node)) {
    return node.reduce((length, child) => length + getNodeTextLength(child), 0);
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeTextLength(node.props.children);
  }

  return 1;
}

function hasComplexMath(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return false;
  }

  if (Array.isArray(node)) {
    return node.some(hasComplexMath);
  }

  if (!isValidElement<{ children?: ReactNode; className?: unknown }>(node)) {
    return false;
  }

  const className =
    typeof node.props.className === 'string' ? node.props.className : '';
  if (
    /(?:^|\s)(?:mfrac|mroot|msup|msub|msubsup|mover|munder|mtable|katex-display)(?:\s|$)/u.test(
      className,
    )
  ) {
    return true;
  }

  return hasComplexMath(node.props.children);
}

/**
 * Chooses a conservative server-rendered fallback from option content. The
 * client enhancer replaces this with a real rendered-width decision when JS
 * is available, while the fallback keeps the page readable without JS.
 */
export function getChoiceDensity(options: ReactNode[]): ChoiceDensity {
  const longestOption = options.reduce<number>(
    (longest, option) => Math.max(longest, getNodeTextLength(option)),
    0,
  );

  if (options.some(hasComplexMath)) return 'regular';
  if (longestOption <= 10) return 'compact';
  if (longestOption >= 25) return 'long';
  return 'regular';
}

function isWhitespaceNode(node: ReactNode) {
  return typeof node === 'string' && node.trim() === '';
}

export function ExamChoices({ children }: ExamOptionProps) {
  const nodes = Children.toArray(children).filter(
    (node) => !isWhitespaceNode(node),
  );
  const markedOptions = nodes.filter(isExamOption);
  const options = markedOptions.length > 0 ? markedOptions : nodes;
  const density = getChoiceDensity(
    options.map((option) => (isExamOption(option) ? option.props.children : option)),
  );

  return (
    <div
      className={styles.choiceOptions}
      data-choice-density={density}
      data-exam-choice-group=""
      role="list"
    >
      {options.map((option, index) => {
        const content = isExamOption(option) ? option.props.children : option;

        return (
          <div
            className={styles.choiceOption}
            data-exam-choice-option=""
            key={isExamOption(option) ? (option.key ?? index) : index}
            role="listitem"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
