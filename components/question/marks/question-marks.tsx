'use client';

import { IconButton, IconButtonParticles } from '@animate-ui/react/primitives/buttons/icon';
import {
  createContext,
  type ReactElement,
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
import { NotebookPenIcon, StarIcon, TagIcon } from '../icons';
import { Animated, useLive } from '../live';
import { useDocumentPath } from '../question-state';
import { NoteEditor, noteSurface } from './note-editor';
import { TagDot } from './tag-dot';
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
export const QuestionMarksScope = Context.Provider;

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

/** A round ghost icon button of the card header and the solution card's toolbar. */
export const iconAction = cn(
  buttonVariants({ variant: 'ghost', size: 'icon' }),
  'size-8 rounded-full p-0 text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground aria-expanded:bg-(--ui-fill-active) aria-expanded:text-foreground dark:hover:bg-(--ui-fill-hover)',
);

/** Fills its button, so pointing anywhere on the button plays the icon inside. */
export function ActionIcon({ children }: { children: ReactElement }) {
  return <Animated animateOnHover className="grid size-full place-items-center">{children}</Animated>;
}

/** The star fills when on, bumps on every press and throws a burst when it turns on. */
function FavoriteButton() {
  const marks = useMarks();
  const live = useLive();
  const on = marks?.mark?.favorite ?? false;
  const button = {
    type: 'button',
    className: cn(iconAction, on && 'text-warning hover:text-warning'),
    'aria-pressed': on,
    'aria-label': on ? '取消收藏' : '收藏',
    title: on ? '取消收藏' : '收藏',
    disabled: !marks?.ready,
    'data-favorite': on ? 'on' : 'off',
    onClick: () => void marks?.update({ favorite: !on }),
  } as const;
  const star = <StarIcon animateOnTap className={cn(on && 'fill-current')} />;
  if (!live) return <button {...button}>{star}</button>;
  return (
    <IconButton {...button}>
      {star}
      {on ? <IconButtonParticles sideOffset={-16} radius={18} count={6} size={3} /> : null}
    </IconButton>
  );
}

/**
 * Favourite, tags and note buttons in the card header. The solution sheet
 * passes its own note handler so editing happens inside the sheet.
 */
export function QuestionMarkActions({ onEditNote, editingNote, className }: { onEditNote?: () => void; editingNote?: boolean; className?: string } = {}) {
  const marks = useMarks();
  if (!marks) return null;
  const hasNote = Boolean(marks.mark?.note);
  const editing = editingNote ?? marks.editingNote;
  return (
    <div data-question-actions="" className={cn('flex shrink-0 items-center gap-0.5', className)}>
      <FavoriteButton />
      <TagPicker className={cn(iconAction, marks.assigned.length > 0 && 'text-foreground')} aria-label="标签" title="标签" disabled={!marks.ready}>
        <ActionIcon><TagIcon /></ActionIcon>
      </TagPicker>
      <button
        type="button"
        className={cn(iconAction, (hasNote || editing) && 'text-foreground')}
        aria-label={hasNote ? '编辑注释' : '添加注释'}
        aria-expanded={editing}
        title={hasNote ? '编辑注释' : '添加注释'}
        disabled={!marks.ready}
        onClick={() => (onEditNote ? onEditNote() : marks.setEditingNote(!marks.editingNote))}
      >
        <ActionIcon><NotebookPenIcon /></ActionIcon>
      </button>
    </div>
  );
}

/** A reader's tag: a neutral capsule with its coloured dot. */
export function UserTagChip({ tag }: { tag: Pick<UserTag, 'name' | 'color'> }) {
  return (
    <span
      data-user-tag=""
      className="inline-flex h-5.5 max-w-48 shrink-0 animate-in items-center gap-1.5 rounded-full bg-(--ui-fill-hover) pr-2.5 pl-2 text-xs leading-none font-medium whitespace-nowrap text-foreground duration-200 fade-in zoom-in-90"
    >
      <TagDot color={tag.color} />
      <span className="truncate">{tag.name}</span>
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
          className="mt-3.5"
          initial={mark?.note ?? ''}
          onCancel={() => setEditingNote(false)}
          onSave={async (note) => { if (await marks.update({ note })) setEditingNote(false); }}
        />
      ) : mark?.note ? (
        <div data-question-note="" className={cn(noteSurface, 'relative mt-3.5 pl-9')}>
          <NotebookPenIcon size={15} aria-hidden="true" className="absolute top-3.5 left-3.5 text-(--exam-missed-ink)" />
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
