import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ExamSolutionDialog } from './exam-solution-dialog';
import styles from './exam-question.module.css';

type ExamSolutionProps = {
  children: ReactNode;
};

type ExamQuestionProps = {
  children: ReactNode;
  buttonLabel?: string;
  dialogTitle?: string;
};

/**
 * Marks the solution part of an <ExamQuestion>.
 *
 * Keep the content as ordinary MDX: math, lists, tables, code blocks and other
 * globally registered MDX components continue to be compiled by Fumadocs.
 */
export function ExamSolution({ children }: ExamSolutionProps) {
  return <>{children}</>;
}

function isExamSolution(
  node: ReactNode,
): node is ReactElement<ExamSolutionProps, typeof ExamSolution> {
  return isValidElement(node) && node.type === ExamSolution;
}

/**
 * Server-side MDX wrapper for an exercise.
 *
 * Only <ExamSolution> is removed from the normal document flow. Everything
 * else remains ordinary MDX, which keeps the main-page typography identical to
 * a directly authored question. The already compiled React nodes are then
 * passed to the small client dialog component for interactive display.
 *
 * Usage:
 * <ExamQuestion>
 *
 * 1. Question written as normal MDX...
 *
 * <ExamSolution>
 * Answer and explanation written as normal MDX...
 * </ExamSolution>
 *
 * </ExamQuestion>
 */
export function ExamQuestion({
  children,
  buttonLabel = '查看解答',
  dialogTitle = '题目与解析',
}: ExamQuestionProps) {
  const nodes = Children.toArray(children);
  const solution = nodes.find(isExamSolution);
  const question = nodes.filter((node) => !isExamSolution(node));

  // Fail soft while a document is being migrated: if the solution slot is
  // missing, keep the original MDX visible instead of dropping any content.
  if (!solution) {
    return <section className={styles.root}>{children}</section>;
  }

  return (
    <section className={styles.root}>
      <div className={styles.question}>{question}</div>
      <ExamSolutionDialog
        question={question}
        solution={solution.props.children}
        buttonLabel={buttonLabel}
        dialogTitle={dialogTitle}
      />
    </section>
  );
}
