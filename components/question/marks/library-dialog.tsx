'use client';

import { NotebookPenIcon, StarIcon } from 'lucide-react';
import Link from 'next/link';
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTags, ModalTitle, useModal } from '@/components/ui/modal';
import type { QuestionMark } from '@/lib/question-store/types';
import { cn } from '@/lib/utils';
import { useQuestionDatabase } from '../database-context';
import { UserTagChip } from './question-marks';
import { liveTagsOf, useUserTags } from './use-marks';

/*
 * Every question the reader starred, tagged or annotated, across pages,
 * filterable by favourite, note or tag. Each entry links to the question.
 *
 * Opens on its own from the account menu, or as a second level on top of a
 * solution sheet; following an entry closes every level.
 */

type Filter = 'all' | 'favorite' | 'note' | `tag:${string}`;

function pageName(path: string) {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* keep the raw path */ }
  const parts = decoded.split('/').filter((part) => part && part !== 'docs');
  return parts.slice(-2).join(' / ') || decoded;
}

function matches(mark: QuestionMark, filter: Filter) {
  if (filter === 'favorite') return mark.favorite;
  if (filter === 'note') return mark.note !== '';
  if (filter.startsWith('tag:')) return mark.tagIds.includes(filter.slice(4));
  return true;
}

/** Closes the whole modal stack (without moving focus) and follows the link. */
function EntryLink(props: ComponentProps<typeof Link>) {
  const modal = useModal();
  return <Link prefetch={false} {...props} onClick={() => modal?.closeAll({ returnFocus: false })} />;
}

export function QuestionLibraryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const context = useQuestionDatabase();
  const { tags, cache } = useUserTags();
  const [marks, setMarks] = useState<QuestionMark[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const database = context?.database ?? null;
  const namespace = context?.namespace;

  useEffect(() => {
    if (!open || !cache) return;
    let disposed = false;
    const load = () => { void cache.listMarks().then((list) => { if (!disposed) setMarks(list); }).catch(() => { if (!disposed) setMarks([]); }); };
    load();
    const unsubscribe = database?.subscribe((change) => { if (change.namespace === namespace && change.scope === 'annotations') load(); });
    return () => { disposed = true; unsubscribe?.(); };
  }, [open, cache, database, namespace]);

  const shown = useMemo(() => (marks ?? []).filter((mark) => matches(mark, filter)), [marks, filter]);
  const counts = useMemo(() => ({
    all: marks?.length ?? 0,
    favorite: marks?.filter((mark) => mark.favorite).length ?? 0,
    note: marks?.filter((mark) => mark.note).length ?? 0,
  }), [marks]);

  const chip = (value: Filter, label: ReactNode, count?: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors',
        filter === value ? 'bg-foreground text-background' : 'bg-(--ui-fill) text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground',
      )}
    >
      {label}
      {count !== undefined ? <span className="tabular-nums opacity-70">{count}</span> : null}
    </button>
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md" className="md:min-h-[min(22rem,calc(100dvh-4rem))]">
        <ModalHeader>
          <ModalTitle>收藏与标签</ModalTitle>
          <ModalTags role="group" aria-label="筛选">
            {chip('all', '全部', counts.all)}
            {chip('favorite', <><StarIcon className="size-3.5" />收藏</>, counts.favorite)}
            {chip('note', <><NotebookPenIcon className="size-3.5" />注释</>, counts.note)}
            {tags.map((tag) => chip(`tag:${tag.tagId}`, <><span data-tag-dot="" data-tag-color={tag.color} />{tag.name}</>))}
          </ModalTags>
        </ModalHeader>
        <ModalBody className="px-3 md:px-4">
          <ModalDescription className="mb-2 px-3 text-sm text-muted-foreground">在题目右上角收藏、打标签或写注释，都会汇总到这里。</ModalDescription>
          <ul className="min-h-40">
            {marks === null ? (
              <li className="px-2 py-8 text-center text-sm text-muted-foreground">正在读取…</li>
            ) : shown.length === 0 ? (
              <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                {marks.length ? '这个分类下还没有题目。' : '还没有收藏、标签或注释的题目。'}
              </li>
            ) : shown.map((mark) => {
              const href = `${mark.documentPath}#question-${encodeURIComponent(mark.questionId)}`;
              const assigned = liveTagsOf(mark, tags);
              return (
                <li key={`${mark.documentPath}\u0000${mark.questionId}`}>
                  <EntryLink
                    href={href}
                    className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-(--ui-fill-hover) focus-visible:bg-(--ui-fill-hover) focus-visible:outline-none"
                  >
                    <span className="line-clamp-2 text-[0.9375rem] leading-relaxed text-foreground">
                      {mark.favorite ? <StarIcon className="mr-1 inline size-3.5 -translate-y-px fill-warning text-warning" aria-label="已收藏" /> : null}
                      {mark.excerpt || mark.questionId}
                    </span>
                    {mark.note ? (
                      <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        <NotebookPenIcon className="mr-1 inline size-3.5 -translate-y-px" aria-label="注释" />{mark.note}
                      </span>
                    ) : null}
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="mr-1 truncate">{pageName(mark.documentPath)}</span>
                      {assigned.map((tag) => <UserTagChip key={tag.tagId} tag={tag} />)}
                    </span>
                  </EntryLink>
                </li>
              );
            })}
          </ul>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
