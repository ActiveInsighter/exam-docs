'use client';

import {
  type AnimationEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import styles from './exam-question.module.css';
import triggerStyles from './exam-solution-trigger.module.css';

const CLOSE_ANIMATION_MS = 160;

type DialogState = 'closed' | 'open' | 'closing';

type ExamSolutionDialogProps = {
  question: ReactNode;
  answer: ReactNode | null;
  explanation: ReactNode;
  buttonLabel: string;
  dialogTitle: string;
};

function hasAnswerContent(answer: ReactNode | null) {
  return answer !== null && answer !== undefined && answer !== false;
}

export function ExamSolutionDialog({
  question,
  answer,
  explanation,
  buttonLabel,
  dialogTitle,
}: ExamSolutionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>('closed');
  const [previewSuppressed, setPreviewSuppressed] = useState(false);
  const titleId = useId();
  const dialogId = useId();
  const answerId = useId();
  const answerIsAvailable = hasAnswerContent(answer);
  const isDialogMounted = dialogState !== 'closed';

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;

    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const finishClose = useCallback(() => {
    clearCloseTimer();

    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }

    setDialogState('closed');
    triggerRef.current?.focus();
  }, [clearCloseTimer]);

  const requestClose = useCallback(() => {
    if (dialogState !== 'open') return;

    setDialogState('closing');
    clearCloseTimer();

    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    closeTimerRef.current = window.setTimeout(
      finishClose,
      reducedMotion ? 0 : CLOSE_ANIMATION_MS,
    );
  }, [clearCloseTimer, dialogState, finishClose]);

  const handleDialogClose = useCallback(() => {
    clearCloseTimer();
    setPreviewSuppressed(true);
    setDialogState('closed');
    triggerRef.current?.focus();
  }, [clearCloseTimer]);

  useEffect(() => {
    if (dialogState !== 'open') return;

    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    dialog.showModal();
    closeButtonRef.current?.focus();
  }, [dialogState]);

  useEffect(() => {
    if (!isDialogMounted) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousPaddingInlineEnd = root.style.paddingInlineEnd;
    const scrollbarWidth = window.innerWidth - root.clientWidth;

    root.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(
        getComputedStyle(root).paddingInlineEnd,
      );
      root.style.paddingInlineEnd = `${currentPadding + scrollbarWidth}px`;
    }

    return () => {
      root.style.overflow = previousOverflow;
      root.style.paddingInlineEnd = previousPaddingInlineEnd;
    };
  }, [isDialogMounted]);

  useEffect(() => {
    return clearCloseTimer;
  }, [clearCloseTimer]);

  const handleAnimationEnd = (event: AnimationEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    if (dialogState === 'closing') finishClose();
  };

  return (
    <>
      <div className={styles.actions}>
        <div
          className={`${styles.triggerWrap} ${
            previewSuppressed ? styles.previewSuppressed : ''
          }`}
          onPointerLeave={() => setPreviewSuppressed(false)}
        >
          <button
            ref={triggerRef}
            type="button"
            className={`${styles.trigger} ${triggerStyles.trigger}`}
            aria-controls={dialogId}
            aria-describedby={answerIsAvailable ? answerId : undefined}
            aria-expanded={dialogState === 'open'}
            aria-haspopup="dialog"
            onBlur={() => setPreviewSuppressed(false)}
            onClick={() => {
              if (dialogState === 'closed') setDialogState('open');
            }}
          >
            <span>{buttonLabel}</span>
          </button>

          {answerIsAvailable ? (
            <div id={answerId} role="tooltip" className={styles.answerPreview}>
              <div className={styles.answerPreviewValue}>{answer}</div>
            </div>
          ) : null}
        </div>
      </div>

      {isDialogMounted ? (
        <dialog
          ref={dialogRef}
          id={dialogId}
          className={`${styles.dialog} ${
            dialogState === 'closing' ? styles.dialogClosing : ''
          }`}
          aria-labelledby={titleId}
          onAnimationEnd={handleAnimationEnd}
          onCancel={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onClose={handleDialogClose}
          onClick={(event) => {
            if (event.target === event.currentTarget) requestClose();
          }}
        >
          <div className={styles.dialogShell}>
            <header className={styles.dialogHeader}>
              <div id={titleId} className={styles.dialogTitle}>
                {dialogTitle}
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.closeButton}
                aria-label="关闭解答"
                onClick={requestClose}
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
                <div className={styles.solutionContent}>
                  {answerIsAvailable ? (
                    <section className={styles.solutionSection}>
                      <div className={styles.paneLabel}>答案</div>
                      <div className={styles.answerValue}>{answer}</div>
                    </section>
                  ) : null}

                  <section className={styles.solutionSection}>
                    <div className={styles.paneLabel}>解析</div>
                    <div className={styles.paneContent}>{explanation}</div>
                  </section>
                </div>
              </section>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
