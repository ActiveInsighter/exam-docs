'use client';

import { useEffect, useState } from 'react';
import { CloudOffIcon, DownloadIcon, FileInputIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import type { AccountMenuSection } from '@/components/account';
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import type { QuestionSummary } from '@/lib/question-store/types';
import { cn } from '@/lib/utils';
import { useQuestionDatabase, type QuestionDatabaseContext } from './database-context';

type Tone = 'ok' | 'busy' | 'muted' | 'warn' | 'error';

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  busy: 'bg-sky-500 animate-pulse',
  muted: 'bg-muted-foreground/50',
  warn: 'bg-amber-500',
  error: 'bg-destructive',
};

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 45) return '刚刚';
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} 小时前`;
  return new Date(iso).toLocaleDateString();
}

/** One short, honest sentence about where the reader's answers are right now. */
export function describeSync(context: QuestionDatabaseContext | null): { tone: Tone; text: string } | null {
  if (!context) return null;
  if (!context.ready) return { tone: 'muted', text: '正在读取本机答题记录…' };
  if (context.error && !context.database) return { tone: 'error', text: '本机存储不可用，答案不会保存' };
  if (!context.user) {
    return context.cachedAccount
      ? { tone: 'muted', text: '登录已过期 · 答案暂存本机' }
      : null;
  }
  const { status, engine } = context;
  if (!engine) return { tone: 'busy', text: '正在连接云端…' };
  if (status.conflicts) return { tone: 'warn', text: `${status.conflicts} 道题两端答案不同，待选择` };
  if (status.phase === 'offline') return { tone: 'muted', text: '离线 · 答案已保存在本机' };
  if (status.phase === 'error') return { tone: 'error', text: '同步失败 · 稍后自动重试' };
  if (status.phase === 'syncing') return { tone: 'busy', text: '正在同步…' };
  if (status.pending) return { tone: 'busy', text: `${status.pending} 条修改待上传` };
  const when = relativeTime(status.lastSyncedAt);
  if (status.live) return { tone: 'ok', text: when ? `实时同步中 · ${when}更新` : '实时同步中' };
  return { tone: 'ok', text: when ? `已同步 · ${when}` : '已同步' };
}

function SyncDot() {
  const sync = describeSync(useQuestionDatabase());
  if (!sync || sync.tone === 'ok' || sync.tone === 'muted') return null;
  return (
    <span aria-hidden className={cn('pointer-events-none absolute right-0.5 bottom-0.5 size-2 rounded-full ring-2 ring-background', DOT[sync.tone])} />
  );
}

function SyncStatus() {
  const sync = describeSync(useQuestionDatabase());
  if (!sync) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" role="status">
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[sync.tone])} />
      <span className="truncate">{sync.text}</span>
    </span>
  );
}

function Stat({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-muted/60 px-1 py-1.5">
      <span className="text-base leading-none font-semibold tabular-nums">{value ?? '–'}</span>
      <span className="text-[0.7rem] text-muted-foreground">{label}</span>
    </div>
  );
}

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function QuestionRecordsMenu() {
  const context = useQuestionDatabase();
  const [summary, setSummary] = useState<QuestionSummary | null>(null);
  const [guestRecords, setGuestRecords] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const database = context?.database ?? null;
  const namespace = context?.namespace ?? 'guest';
  const signedIn = Boolean(context?.user);

  useEffect(() => {
    if (!database) return;
    let disposed = false;
    const refresh = () => {
      void Promise.all([
        database.summary(namespace),
        namespace === 'guest' ? Promise.resolve(null) : database.summary('guest'),
      ]).then(([own, guest]) => {
        if (disposed) return;
        setSummary(own);
        setGuestRecords(guest ? guest.answered + guest.attempts : 0);
      }).catch(() => undefined);
    };
    refresh();
    const unsubscribe = database.subscribe((change) => { if (change.namespace === namespace) refresh(); });
    return () => { disposed = true; unsubscribe(); };
  }, [database, namespace]);

  if (!context) return null;
  const { engine, status } = context;
  const syncing = status.phase === 'syncing';

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center justify-between">
        答题记录
        <span className="font-normal">{signedIn ? '本机 + 云端' : '仅本机'}</span>
      </DropdownMenuLabel>
      <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5">
        <Stat value={summary?.answered ?? null} label="已作答" />
        <Stat value={summary?.submitted ?? null} label="已提交" />
        <Stat value={summary?.attempts ?? null} label="提交历史" />
      </div>
      {signedIn ? (
        <DropdownMenuItem closeOnClick={false} disabled={!engine || syncing} onClick={() => { void engine?.sync(); }}>
          <RefreshCwIcon className={cn(syncing && 'animate-spin')} />
          {syncing ? '正在同步…' : '立即同步'}
          {status.phase === 'offline' ? <CloudOffIcon className="ml-auto text-muted-foreground" /> : null}
        </DropdownMenuItem>
      ) : null}
      {status.conflicts ? (
        <DropdownMenuItem onClick={context.openConflicts} className="text-amber-700 dark:text-amber-400">
          <TriangleAlertIcon />选择冲突答案
          <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 text-xs tabular-nums">{status.conflicts}</span>
        </DropdownMenuItem>
      ) : null}
      {signedIn && guestRecords > 0 ? (
        <DropdownMenuItem
          closeOnClick={false}
          disabled={!database}
          onClick={() => {
            void database?.importGuest(namespace).then((result) => {
              setMessage(result.records || result.attempts
                ? `已导入 ${result.records} 道题、${result.attempts} 次提交，未登录记录仍保留。`
                : '未登录记录已全部导入过。');
            }).catch(() => setMessage('导入失败，请重试。'));
          }}
        >
          <FileInputIcon />导入未登录时的记录
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        disabled={!database}
        onClick={() => {
          void database?.exportBackup(namespace).then((backup) =>
            download(`exam-docs-answers-${new Date().toISOString().slice(0, 10)}.json`, backup));
        }}
      >
        <DownloadIcon />导出本机备份
      </DropdownMenuItem>
      {status.error && status.phase === 'error' ? (
        <p role="alert" className="px-1.5 pt-1 text-xs break-words text-destructive">{status.error}</p>
      ) : null}
      {message ? <p role="status" className="px-1.5 pt-1 text-xs text-muted-foreground">{message}</p> : null}
    </DropdownMenuGroup>
  );
}

export const questionAccountSection: AccountMenuSection = {
  id: 'question-records',
  order: 500,
  audience: 'all',
  render: () => <QuestionRecordsMenu />,
  indicator: () => <SyncDot />,
  status: ({ account }) => (account.phase === 'signed-in' ? <SyncStatus /> : null),
};
