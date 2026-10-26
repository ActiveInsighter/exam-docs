'use client';

import { type ReactNode, type RefObject, useSyncExternalStore } from 'react';
import type { QuestionType } from './grading';
import type { MarksContext } from './marks/question-marks';
import type { QuestionTags } from './model';
import type { QuestionState } from './question-state';

/*
 * Every question on the page that has a solution sheet, in document order,
 * so a sheet can step through them like a deck of study cards.
 *
 * Each sheet registers what its card needs: the props it was given and the
 * live state and marks of its question, which the sheet showing that card
 * provides again (QuestionStateScope / QuestionMarksScope), so a card
 * behaves exactly like its question's own sheet. Registration is cheap: the
 * snapshot is only built when a sheet that is showing reads it.
 */

export type SolutionEntry = {
  /** Unique per sheet, even if two questions share an id. */
  key: string;
  questionId: string;
  questionType: QuestionType;
  trigger: RefObject<HTMLButtonElement | null>;
  solution: ReactNode;
  dialogTitle: string;
  numberLabel: string | null;
  typeLabel: string;
  points?: number;
  tags: QuestionTags;
  state: QuestionState | null;
  marks: MarksContext | null;
};

const entries = new Map<string, SolutionEntry>();
const listeners = new Set<() => void>();
let snapshot: readonly SolutionEntry[] = [];
/** The snapshot is rebuilt on first read after a change; order only when sheets came or went. */
let stale = false;
let reorder = false;

function documentOrder(a: SolutionEntry, b: SolutionEntry) {
  const first = a.trigger.current;
  const second = b.trigger.current;
  if (!first || !second || first === second) return 0;
  return first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function getSnapshot() {
  if (!stale) return snapshot;
  stale = false;
  if (reorder) {
    reorder = false;
    snapshot = [...entries.values()].sort(documentOrder);
  } else {
    snapshot = snapshot.map((entry) => entries.get(entry.key) ?? entry);
  }
  return snapshot;
}

function changed(membership: boolean) {
  stale = true;
  if (membership) reorder = true;
  listeners.forEach((listener) => listener());
}

export function setSolutionEntry(entry: SolutionEntry) {
  const added = !entries.has(entry.key);
  entries.set(entry.key, entry);
  changed(added);
}

export function removeSolutionEntry(key: string) {
  if (entries.delete(key)) changed(true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerSnapshot = (): readonly SolutionEntry[] => [];
const idle = () => () => {};

/** The page's questions with solutions, in document order; follows changes while `live`. */
export function useSolutionDeck(live = true) {
  return useSyncExternalStore(live ? subscribe : idle, getSnapshot, getServerSnapshot);
}
