'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useShouldReduceMotion } from '@animate-ui/react/utils/motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ANNOTATION_LIMITS } from '@/lib/question-store/types';

/** The note's paper: a warm tint in a hairline, shared by the note and its editor. */
export const noteSurface = 'rounded-[0.875rem] border border-(--exam-missed-line) bg-(--exam-missed-tint) px-3.5 py-2.5 text-[0.9375rem] leading-[1.7]';

/** Inline note editor: grows with its text; ⌘/Ctrl + Enter saves, Esc cancels. */
export function NoteEditor({
  initial,
  onSave,
  onCancel,
  className,
}: {
  initial: string;
  className?: string;
  onSave: (note: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const reduce = useShouldReduceMotion();
  const editor = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const over = text.length > ANNOTATION_LIMITS.note;

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }, [text]);

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const previous = document.activeElement;
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
    const surface = editor.current;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected && surface?.contains(document.activeElement)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  useLayoutEffect(() => {
    area.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'instant' : 'smooth' });
  }, [reduce]);

  const save = async () => {
    if (over || saving) return;
    setSaving(true);
    try { await onSave(text); } finally { setSaving(false); }
  };

  return (
    <div ref={editor} data-question-note="" data-editing="" className={cn(noteSurface, className)}>
      <textarea
        ref={area}
        value={text}
        rows={3}
        aria-label="我的注释"
        placeholder="记下思路、易错点或复习提醒…"
        className="block w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed outline-none placeholder:text-muted-foreground/70"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save(); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={over ? 'text-xs text-destructive' : 'text-xs text-muted-foreground tabular-nums'}>
          {text.length} / {ANNOTATION_LIMITS.note}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter 保存</span>
        <div className="ml-auto flex gap-1.5">
          {initial ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={saving} onClick={() => void onSave('')}>
              删除
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>取消</Button>
          <Button size="sm" onClick={() => void save()} disabled={over || saving || text === initial}>保存</Button>
        </div>
      </div>
    </div>
  );
}
