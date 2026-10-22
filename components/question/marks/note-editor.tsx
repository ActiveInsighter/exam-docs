'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ANNOTATION_LIMITS } from '@/lib/question-store/types';

/** Inline note editor: grows with its text; ⌘/Ctrl + Enter saves, Esc cancels. */
export function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (note: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
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
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  const save = async () => {
    if (over || saving) return;
    setSaving(true);
    try { await onSave(text); } finally { setSaving(false); }
  };

  return (
    <div data-question-note="" data-editing="" className="pl-3.5!">
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
          if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
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
