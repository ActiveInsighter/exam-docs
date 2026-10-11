'use client';

import type { ReactNode } from 'react';
import { useReadingEvidence } from './evidence-context';
import styles from './reading.module.css';

/** Native inline fragments retain correct wrapping, zoom and rich-text layout. */
export function ExamKeySentence({ id, children }: { id: string; children: ReactNode }) {
  const evidence = useReadingEvidence();
  const active = evidence.ids.includes(id);
  const Tag = active ? 'mark' : 'span';
  return <Tag key={evidence.revision} className={styles.evidence} data-exam-key-sentence={id}
    data-evidence-active={active} data-evidence-current={active && evidence.current === id}>
    {children}
  </Tag>;
}
