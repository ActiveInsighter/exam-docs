'use client';

import { NotebookPenIcon } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { buttonVariants } from '@/components/ui/button';
import type { MarkPatch } from '@/lib/question-store';
import type { QuestionMark, UserTag } from '@/lib/question-store/types';
import { cn } from '@/lib/utils';
import { useDocumentPath } from '../question-state';
import { NoteEditor } from './note-editor';
import { TagPicker } from './tag-picker';
import { liveTagsOf, useQuestionMark, useUserTags } from './use-marks';

/*
 * The reader's own layer on a question: favourite, personal tags and a note.
 * One provider per question holds the subscription; the header actions, the
 * tag chips and the note block below the footer read it.
 */

export type MarksContext = {
  questionId: string;
  mark: QuestionMark | null;
  tags: readonly UserTag[];
  assigned: UserTag[];
  ready: boolean;
  editingNote: boolean;
  setEditingNote: (editing: boolean) => void;
  update: (patch: MarkPatch) => Promise<boolean>;
  error: string | null;
};

const Context = createContext<MarksContext | null>(null);

export function useMarks() {
  return useContext(Context);
}

/** Provides marks read elsewhere on the page: the solution sheet showing another question. */
export function QuestionMarksScope({ value, children }: { value: MarksContext | null; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function QuestionMarksProvider({ questionId, children }: { questionId: string; children: ReactNode }) {
  const documentPath = useDocumentPath();
  const { mark, ready, update: write } = useQuestionMark(documentPath, questionId);
  const { tags } = useUserTags();
  const [editingNote, setEditingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = useCallback(async (patch: MarkPatch) => {
    try {
      await write(patch);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error && cause.name === 'AnnotationError' ? cause.message : '没能保存到本机，请重试。');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setError(null), 5000);
      return false;
    }
  }, [write]);

  const assigned = useMemo(() => liveTagsOf(mark, tags), [mark, tags]);
  const value = useMemo<MarksContext>(
    () => ({ questionId, mark, tags, assigned, ready, editingNote, setEditingNote, update, error }),
    [questionId, mark, tags, assigned, ready, editingNote, update, error],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/* Plain buttons styled like ghost icon buttons: three per card, so no Base UI wrapper. */
const actionClass = buttonVariants({ variant: 'ghost', size: 'icon' }) + ' size-8 rounded-full text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active) aria-expanded:text-foreground';

function FavoriteButton() {
  const marks = useMarks();
  const on = marks?.mark?.favorite ?? false;
  return (
    <button
      type="button"
      className={cn(actionClass, on && 'text-warning hover:text-warning')}
      aria-pressed={on}
      aria-label={on ? '取消收藏' : '收藏'}
      title={on ? '取消收藏' : '收藏'}
      disabled={!marks?.ready}
      data-favorite={on ? 'on' : 'off'}
      onClick={() => void marks?.update({ favorite: !on })}
    >
      <span data-action-icon="star" aria-hidden="true" />
    </button>
  );
}

/**
 * Favourite, tags and note buttons in the card header. The solution sheet
 * passes its own note handler so editing happens inside the sheet.
 */
export function QuestionMarkActions({ onEditNote, editingNote }: { onEditNote?: () => void; editingNote?: boolean } = {}) {
  const marks = useMarks();
  if (!marks) return null;
  const hasNote = Boolean(marks.mark?.note);
  const editing = editingNote ?? marks.editingNote;
  return (
    <div data-question-actions="">
      <FavoriteButton />
      <TagPicker className={cn(actionClass, marks.assigned.length > 0 && 'text-foreground')} aria-label="标签" title="标签" disabled={!marks.ready}>
        <span data-action-icon="tag" aria-hidden="true" />
      </TagPicker>
      <button
        type="button"
        className={cn(actionClass, (hasNote || editing) && 'text-foreground')}
        aria-label={hasNote ? '编辑注释' : '添加注释'}
        aria-expanded={editing}
        title={hasNote ? '编辑注释' : '添加注释'}
        disabled={!marks.ready}
        onClick={() => (onEditNote ? onEditNote() : marks.setEditingNote(!marks.editingNote))}
      >
        <span data-action-icon="note" aria-hidden="true" />
      </button>
    </div>
  );
}

export function UserTagChip({ tag }: { tag: Pick<UserTag, 'name' | 'color'> }) {
  return (
    <span data-user-tag="" data-tag-color={tag.color}>
      <span data-tag-dot="" aria-hidden="true" />
      <span>{tag.name}</span>
    </span>
  );
}

/** The reader's tags on this question, beside the built-in ones. */
export function QuestionUserTags() {
  const marks = useMarks();
  if (!marks?.assigned.length) return null;
  return (
    <span className="contents" aria-label="我的标签">
      {marks.assigned.map((tag) => <UserTagChip key={tag.tagId} tag={tag} />)}
    </span>
  );
}

/** The note under the question, or its editor. */
export function QuestionNote() {
  const marks = useMarks();
  if (!marks) return null;
  const { mark, editingNote, setEditingNote, error } = marks;
  return (
    <>
      {editingNote ? (
        <NoteEditor
          initial={mark?.note ?? ''}
          onCancel={() => setEditingNote(false)}
          onSave={async (note) => { if (await marks.update({ note })) setEditingNote(false); }}
        />
      ) : mark?.note ? (
        <div data-question-note="">
          <NotebookPenIcon aria-hidden="true" />
          <span className="sr-only">我的注释：</span>
          <button
            type="button"
            className="block w-full cursor-text text-left break-words whitespace-pre-wrap outline-none focus-visible:underline"
            onClick={() => setEditingNote(true)}
            title="点击编辑注释"
          >
            {mark.note}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    </>
  );
}
