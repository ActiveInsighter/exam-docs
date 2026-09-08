'use client';

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
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
 * Renders the question exactly where it is authored, while moving only the
 * solution into a modal dialog. The same already-compiled MDX question is also
 * shown beside the solution inside the dialog, so KaTeX and other MDX output do
 * not need a second rendering pipeline.
 *
 * Usage:
 * <ExamQuestion>
 *   Question written as normal MDX...
 *   <ExamSolution>Answer and explanation...</ExamSolution>
 * </ExamQuestion>
 */
export function ExamQuestion({
  children,
  buttonLabel = '查看解答',
  dialogTitle = '题目与解析',
}: ExamQuestionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const nodes = useMemo(() => Children.toArray(children), [children]);
  const solution = nodes.find(isExamSolution);
  const question = nodes.filter((node) => !isExamSolution(node));

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    dialog.showModal();
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [open]);

  // Fail soft if a document is mid-migration or the author forgets the slot.
  // Nothing is lost: the original MDX remains visible instead of disappearing.
  if (!solution) {
    return <section className={styles.root}>{children}</section>;
  }

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  return (
    <section className={styles.root}>
      <div className={styles.question}>{question}</div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <span>{buttonLabel}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={styles.triggerIcon}
          >
            <path
              d="m7.75 4.75 5.25 5.25-5.25 5.25"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-labelledby={titleId}
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div className={styles.dialogShell}>
            <header className={styles.dialogHeader}>
              <h2 id={titleId} className={styles.dialogTitle}>
                {dialogTitle}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.closeButton}
                aria-label="关闭解答"
                onClick={closeDialog}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path
                    d="m5 5 10 10M15 5 5 15"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            </header>

            <div className={styles.dialogBody}>
              <section className={`${styles.pane} ${styles.questionPane}`}>
                <div className={styles.paneLabel}>题目</div>
                <div className={styles.paneContent}>{question}</div>
              </section>

              <section className={`${styles.pane} ${styles.solutionPane}`}>
                <div className={styles.paneLabel}>答案与解析</div>
                <div className={styles.paneContent}>{solution.props.children}</div>
              </section>
            </div>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
