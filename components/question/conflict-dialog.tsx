'use client';

import { useEffect, useState } from 'react';
import { CloudIcon, MonitorSmartphoneIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AnswerState, QuestionConflict } from '@/lib/question-store/types';
import { useQuestionDatabase } from './database-context';

function describeAnswer(state: AnswerState) {
  const answer = state.selected.length ? state.selected.join('、') : state.values.filter((value) => value.trim()).join('；');
  return { label: state.submitted ? '已提交' : '草稿', answer: answer || '尚未作答' };
}

function Side({ icon, title, state, onChoose, busy }: {
  icon: React.ReactNode; title: string; state: AnswerState; onChoose(): void; busy: boolean;
}) {
  const { label, answer } = describeAnswer(state);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{title} · {label}</div>
      <p className="min-h-5 text-sm break-words">{answer}</p>
      <Button size="sm" variant="outline" disabled={busy} onClick={onChoose}>使用这个答案</Button>
    </div>
  );
}

/**
 * Two devices changed the same question from the same cloud version. Both
 * answers are kept until the reader picks one; submission history is never
 * discarded, whichever side wins.
 */
export function QuestionConflictDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const context = useQuestionDatabase();
  const [conflicts, setConflicts] = useState<QuestionConflict[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const database = context?.database ?? null;
  const namespace = context?.namespace ?? 'guest';

  useEffect(() => {
    if (!database || !open) return;
    let disposed = false;
    const refresh = () => {
      void database.listConflicts(namespace).then((items) => {
        if (disposed) return;
        setConflicts(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        if (!items.length) onOpenChange(false);
      }).catch(() => { if (!disposed) setFailure('无法读取冲突记录。'); });
    };
    refresh();
    const unsubscribe = database.subscribe((change) => { if (change.namespace === namespace) refresh(); });
    return () => { disposed = true; unsubscribe(); };
  }, [database, namespace, open, onOpenChange]);

  async function choose(conflict: QuestionConflict, resolution: 'local' | 'remote') {
    if (!database) return;
    setBusy(true); setFailure(null);
    try { await database.resolveConflict(namespace, conflict.conflictId, resolution); }
    catch { setFailure('保存选择失败，请重试。'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>选择要保留的答案</DialogTitle>
          <DialogDescription>这些题在两台设备上被同时修改。选择后另一端会自动更新，两边的提交历史都会保留。</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-4">
          {conflicts.map((conflict) => (
            <li key={conflict.conflictId} className="flex flex-col gap-2">
              <a
                href={`${conflict.documentPath}#question-${encodeURIComponent(conflict.questionId)}`}
                onClick={() => onOpenChange(false)}
                className="truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {conflict.documentPath.replace(/^\/docs\//, '')} · {conflict.questionId}
              </a>
              <div className="grid gap-2 sm:grid-cols-2">
                <Side icon={<MonitorSmartphoneIcon className="size-3.5" />} title="本机" state={conflict.localState} busy={busy} onChoose={() => void choose(conflict, 'local')} />
                <Side icon={<CloudIcon className="size-3.5" />} title="云端" state={conflict.remote.state} busy={busy} onChoose={() => void choose(conflict, 'remote')} />
              </div>
            </li>
          ))}
        </ul>
        {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
