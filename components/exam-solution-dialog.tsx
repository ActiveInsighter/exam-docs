'use client';

import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import styles from './exam-question.module.css';

type ExamSolutionDialogProps = {
  question: ReactNode;
  solution: ReactNode;
  buttonLabel: string;
  dialogTitle: string;
};

export function ExamSolutionDialog({
  question,
  solution,
  buttonLabel,
  dialogTitle,
}: ExamSolutionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

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

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  return (
    <>
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
                <div className={styles.paneContent}>{solution}</div>
              </section>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
