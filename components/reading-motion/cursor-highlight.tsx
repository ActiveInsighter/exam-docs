'use client';

import { useRef, type ReactNode } from 'react';
import { useCursorHighlight, type HighlightMode } from './use-cursor-highlight';
import styles from './cursor-highlight.module.css';

export interface CursorHighlightProps {
  children: ReactNode;
  mode?: HighlightMode;
  playKey?: string | number;
  scrollRoot?: HTMLElement | null;
  onComplete?: () => void;
}

/** A decorative selection layer; the real text stays selectable and accessible. */
export function CursorHighlight({ children, mode = 'idle', playKey = 0, scrollRoot = null, onComplete }: CursorHighlightProps) {
  const root = useRef<HTMLSpanElement>(null);
  useCursorHighlight(root, { mode, playKey, scrollRoot, onComplete });
  return (
    <span ref={root} className={styles.highlight} data-reading-motion="highlight" data-evidence-active={mode !== 'idle'}>
      <span className={styles.overlay} data-motion-overlay="" aria-hidden="true" />
      <span className={styles.text} data-motion-text="">{children}</span>
      <span className={styles.cursor} data-motion-cursor="" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4.4 3.1C3.2 3.3 2.6 4.5 3.1 5.9L7.8 19.3C8.5 21.4 10.4 22 11.5 19.9L14.1 14.8L19.3 12.2C21.4 11.1 20.8 9.2 18.7 8.5L5.3 3.7C4.9 3.6 4.6 3.5 4.4 3.1Z" fill="black" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}
