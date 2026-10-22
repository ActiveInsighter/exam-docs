'use client';

import { CheckIcon, ChevronLeftIcon, PlusIcon, Settings2Icon, Trash2Icon } from 'lucide-react';
import { type ComponentProps, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { ANNOTATION_LIMITS, normalizeTagName, type TagColor, type UserTag } from '@/lib/question-store/types';
import { cn } from '@/lib/utils';
import { useMarks } from './question-marks';
import { useUserTags } from './use-marks';

const COLOR_ORDER: readonly TagColor[] = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'gray'];
const COLOR_NAMES: Record<TagColor, string> = {
  gray: '灰', red: '红', orange: '橙', amber: '黄', green: '绿', teal: '青', blue: '蓝', violet: '紫', pink: '粉',
};

const nextColor = (tags: readonly UserTag[]) => COLOR_ORDER[tags.length % COLOR_ORDER.length];
const describe = (error: unknown) => (error instanceof Error && error.name === 'AnnotationError' ? error.message : '没能保存标签，请重试。');

const row = 'flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-(--ui-fill-hover) focus-visible:bg-(--ui-fill-hover)';

function Dot({ color }: { color: TagColor }) {
  return <span data-tag-color={color} data-tag-dot="" aria-hidden="true" className="size-2.5!" />;
}

function PickView({ onManage }: { onManage: () => void }) {
  const marks = useMarks()!;
  const { tags, cache } = useUserTags();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const name = normalizeTagName(query);
  const assigned = new Set(marks.mark?.tagIds ?? []);
  const shown = name ? tags.filter((tag) => tag.name.toLowerCase().includes(name.toLowerCase())) : tags;
  const exact = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());

  const toggle = (tagId: string) => {
    const next = assigned.has(tagId) ? [...assigned].filter((id) => id !== tagId) : [...assigned, tagId];
    void marks.update({ tagIds: next });
  };

  const create = async () => {
    if (!name || !cache) return;
    if (exact) {
      if (!assigned.has(exact.tagId)) toggle(exact.tagId);
      setQuery('');
      return;
    }
    try {
      const tag = await cache.saveTag({ name, color: nextColor(tags) });
      await marks.update({ tagIds: [...assigned, tag.tagId] });
      setQuery('');
      setError(null);
    } catch (cause) {
      setError(describe(cause));
    }
  };

  return (
    <>
      <PopoverTitle>为本题添加标签</PopoverTitle>
      <input
        value={query}
        autoFocus
        maxLength={ANNOTATION_LIMITS.tagName * 2}
        placeholder="搜索或新建，如「难题」"
        aria-label="搜索或新建标签"
        className="mb-1 h-9 w-full rounded-lg bg-(--ui-fill) px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => { setQuery(event.target.value); setError(null); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void create(); }
        }}
      />
      <div className="max-h-64 overflow-y-auto overscroll-contain py-0.5" role="group" aria-label="我的标签">
        {shown.map((tag) => {
          const on = assigned.has(tag.tagId);
          return (
            <button key={tag.tagId} type="button" className={row} aria-pressed={on} onClick={() => toggle(tag.tagId)}>
              <Dot color={tag.color} />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              <CheckIcon className={cn('size-4 shrink-0 transition-opacity', on ? 'opacity-100' : 'opacity-0')} />
            </button>
          );
        })}
        {name && !exact ? (
          <button type="button" className={cn(row, 'text-foreground')} onClick={() => void create()}>
            <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">新建「{name}」</span>
            <Dot color={nextColor(tags)} />
          </button>
        ) : null}
        {!tags.length && !name ? (
          <p className="px-2 py-3 text-sm leading-relaxed text-muted-foreground">
            还没有标签。输入名称后回车即可新建，标签会出现在题目左上角，并可在账号菜单的「收藏与标签」里集中查看。
          </p>
        ) : null}
      </div>
      {error ? <p role="alert" className="px-2 pt-1 text-xs text-destructive">{error}</p> : null}
      {tags.length ? (
        <div className="mt-1 border-t border-(--ui-fill-strong) pt-1">
          <button type="button" className={cn(row, 'text-muted-foreground')} onClick={onManage}>
            <Settings2Icon className="size-4" />管理标签
          </button>
        </div>
      ) : null}
    </>
  );
}

function ManageRow({ tag }: { tag: UserTag }) {
  const { cache } = useUserTags();
  const [name, setName] = useState(tag.name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: { name?: string; color?: TagColor }) => {
    try {
      await cache?.saveTag({ tagId: tag.tagId, name: patch.name ?? tag.name, color: patch.color ?? tag.color });
      setError(null);
    } catch (cause) {
      setError(describe(cause));
      setName(tag.name);
    }
  };

  const cycle = () => {
    const color = COLOR_ORDER[(COLOR_ORDER.indexOf(tag.color) + 1) % COLOR_ORDER.length];
    void save({ color });
  };

  return (
    <li className="py-0.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-(--ui-fill-hover)"
          aria-label={`颜色：${COLOR_NAMES[tag.color]}，点击切换`}
          onClick={cycle}
        >
          <Dot color={tag.color} />
        </button>
        <input
          value={name}
          maxLength={ANNOTATION_LIMITS.tagName * 2}
          aria-label="标签名称"
          className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none hover:bg-(--ui-fill) focus-visible:bg-(--ui-fill)"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => { if (normalizeTagName(name) !== tag.name) void save({ name }); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur(); }}
        />
        <button
          type="button"
          className={cn(
            'h-8 shrink-0 rounded-lg px-2 text-xs transition-colors',
            confirming ? 'bg-destructive/12 font-medium text-destructive' : 'text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground',
          )}
          aria-label={confirming ? `确认删除标签「${tag.name}」` : `删除标签「${tag.name}」`}
          onBlur={() => setConfirming(false)}
          onClick={() => {
            if (!confirming) { setConfirming(true); return; }
            void cache?.deleteTag(tag.tagId).catch((cause: unknown) => setError(describe(cause)));
          }}
        >
          {confirming ? '确认删除' : <Trash2Icon className="size-4" />}
        </button>
      </div>
      {error ? <p role="alert" className="px-2 text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

function ManageView({ onBack }: { onBack: () => void }) {
  const { tags } = useUserTags();
  return (
    <>
      <div className="flex items-center gap-1">
        <button type="button" className="grid size-7 place-items-center rounded-md hover:bg-(--ui-fill-hover)" aria-label="返回" onClick={onBack}>
          <ChevronLeftIcon className="size-4" />
        </button>
        <PopoverTitle className="px-1 pt-0 pb-0">管理标签</PopoverTitle>
      </div>
      <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">改名、换色或删除；删除会从所有题目上移除该标签。</p>
      <ul className="max-h-72 overflow-y-auto overscroll-contain">
        {tags.map((tag) => <ManageRow key={tag.tagId} tag={tag} />)}
      </ul>
    </>
  );
}

type TagPickerProps = Omit<ComponentProps<'button'>, 'onClick' | 'type'>;

/**
 * Button and popover for picking, creating and managing the reader's tags on
 * one question. The trigger is a plain button and the popover anchors to it,
 * mounting on first use: every question card has one.
 */
export function TagPicker(props: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'pick' | 'manage'>('pick');
  const buttonRef = useRef<HTMLButtonElement>(null);
  /* A press on the button counts as an outside press, which closes the popover before the click. */
  const wasOpen = useRef(false);

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) setView('pick');
  };

  return (
    <>
      <button
        {...props}
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={() => { wasOpen.current = open; }}
        onClick={() => {
          const close = wasOpen.current;
          wasOpen.current = false;
          setMounted(true);
          change(!close);
        }}
      />
      {mounted ? (
        <Popover open={open} onOpenChange={change}>
          <PopoverContent aria-label="标签" anchor={buttonRef} finalFocus={buttonRef}>
            {view === 'pick' ? <PickView onManage={() => setView('manage')} /> : <ManageView onBack={() => setView('pick')} />}
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}
