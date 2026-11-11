'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChartNoAxesColumnIcon, ChevronRightIcon, CloudOffIcon, FileInputIcon, LibraryBigIcon, RefreshCwIcon, Settings2Icon } from 'lucide-react';
import type { AccountMenuSection } from '@/components/account';
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { resolveSource } from '@/lib/doc-sources';
import { useSourceTree } from '@/lib/doc-sources-client';
import { totalsOf, type QuestionRecord } from '@/lib/question-records';
import { cn } from '@/lib/utils';
import { useQuestionDatabase, type QuestionDatabaseContext } from './database-context';
import { useQuestionRecords } from './use-question-records';

type Tone = 'ok' | 'busy' | 'muted' | 'warn' | 'error';

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  busy: 'bg-sky-500 animate-pulse motion-reduce:animate-none',
  muted: 'bg-muted-foreground/50',
  warn: 'bg-amber-500',
  error: 'bg-destructive',
};

export function relativeTime(iso: string | null): string | null {
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
  if (context.error && !context.database) {
    return { tone: 'error', text: context.user ? '本机存储不可用 · 提交仍同步到云端' : '本机存储不可用，答案不会保存' };
  }
  if (!context.user) {
    return context.cachedAccount
      ? { tone: 'muted', text: '登录已过期 · 答案暂存本机' }
      : null;
  }
  const { status, engine } = context;
  if (!engine || status.phase === 'local') return { tone: 'busy', text: '正在连接云端…' };
  if (status.phase === 'offline') return { tone: 'muted', text: '离线 · 答案已保存在本机' };
  if (status.phase === 'error') return { tone: 'error', text: '同步失败 · 稍后自动重试' };
  if (status.phase === 'syncing') return { tone: 'busy', text: '正在同步…' };
  if (status.pending) return { tone: 'busy', text: `${status.pending} 条修改待上传` };
  const when = relativeTime(status.lastSyncedAt);
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

/** The pages answered on most recently (newest first), each with all its answered questions counted. */
function recentPages(records: readonly QuestionRecord[], limit: number) {
  const pages = new Map<string, { documentPath: string; answered: number; lastAt: string }>();
  for (const record of records) {
    if (!record.answered) continue;
    const page = pages.get(record.documentPath);
    if (page) page.answered++;
    else if (pages.size < limit) pages.set(record.documentPath, { documentPath: record.documentPath, answered: 1, lastAt: record.lastAt });
  }
  return [...pages.values()];
}

function QuestionRecordsMenu() {
  const context = useQuestionDatabase();
  const { records } = useQuestionRecords();
  const { index } = useSourceTree();
  const [guestRecords, setGuestRecords] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const database = context?.database ?? null;
  const namespace = context?.namespace ?? 'guest';
  const signedIn = Boolean(context?.user);
  const totals = useMemo(() => (records ? totalsOf(records) : null), [records]);
  const recent = useMemo(() => (records ? recentPages(records, 3) : []), [records]);

  useEffect(() => {
    if (!database || namespace === 'guest') return;
    let disposed = false;
    const refresh = () => {
      void database.answers.summary('guest').then((guest) => {
        if (!disposed) setGuestRecords(guest.answered + guest.attempts);
      }).catch(() => undefined);
    };
    refresh();
    const unsubscribe = database.subscribe((change) => { if (change.namespace === 'guest') refresh(); });
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
        <Stat value={totals?.answered ?? null} label="已作答" />
        <Stat value={totals?.submitted ?? null} label="已提交" />
        <Stat value={totals?.pages ?? null} label="涉及页面" />
      </div>
      {recent.length ? (
        <>
          <p className="px-1.5 pt-1 pb-0.5 text-xs text-muted-foreground">最近在做</p>
          {recent.map((page) => {
            const source = resolveSource(index, page.documentPath);
            return (
              <DropdownMenuItem
                key={page.documentPath}
                render={<Link href={page.documentPath} prefetch={false} />}
                className="items-start gap-2 py-1.5"
              >
                <span className="mt-0.5 shrink-0 rounded-sm bg-primary/10 px-1 text-[0.7rem] leading-4 font-medium text-primary">{source.module}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{source.page}</span>
                  {source.folders.length ? <span className="truncate text-xs text-muted-foreground">{source.folders.join(' › ')}</span> : null}
                </span>
                <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">{page.answered} 题</span>
              </DropdownMenuItem>
            );
          })}
        </>
      ) : null}
      <DropdownMenuItem render={<Link href="/settings#records" prefetch={false} />}>
        <ChartNoAxesColumnIcon />全部记录与来源
        <ChevronRightIcon className="ml-auto text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => context.openLibrary()}>
        <LibraryBigIcon />收藏与标签
      </DropdownMenuItem>
      {signedIn ? (
        <DropdownMenuItem closeOnClick={false} disabled={!engine || syncing} onClick={() => { void engine?.sync(); }}>
          <RefreshCwIcon className={cn(syncing && 'animate-spin motion-reduce:animate-none')} />
          {syncing ? '正在同步…' : '立即同步'}
          {status.phase === 'offline' ? <CloudOffIcon className="ml-auto text-muted-foreground" /> : null}
        </DropdownMenuItem>
      ) : null}
      {signedIn && guestRecords > 0 ? (
        <DropdownMenuItem
          closeOnClick={false}
          disabled={!database}
          onClick={() => {
            void importGuestRecords(context).then(setMessage);
          }}
        >
          <FileInputIcon />导入未登录时的记录
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem render={<Link href="/settings" prefetch={false} />}>
        <Settings2Icon />设置
      </DropdownMenuItem>
      {status.error && status.phase === 'error' ? (
        <p role="alert" className="px-1.5 pt-1 text-xs break-words text-destructive">{status.error}</p>
      ) : null}
      {message ? <p role="status" className="px-1.5 pt-1 text-xs text-muted-foreground">{message}</p> : null}
    </DropdownMenuGroup>
  );
}

/** Copies the guest records into the signed-in account; returns the sentence to show. */
export function importGuestRecords(context: QuestionDatabaseContext): Promise<string> {
  const { database, namespace, engine } = context;
  if (!database) return Promise.resolve('本机数据库不可用。');
  return database.importGuest(namespace).then((result) => {
    void engine?.sync();
    return result.records || result.attempts || result.marks
      ? `已导入 ${result.records} 道题、${result.attempts} 次提交、${result.marks} 条收藏与注释，未登录记录仍保留。`
      : '未登录记录已全部导入过。';
  }).catch(() => '导入失败，请重试。');
}

/** Saves the reader's local records as a JSON file. */
export function downloadBackup(context: QuestionDatabaseContext): Promise<void> {
  const { database, namespace } = context;
  if (!database) return Promise.reject(new Error('本机数据库不可用。'));
  return database.exportBackup(namespace).then((backup) =>
    download(`exam-docs-answers-${new Date().toISOString().slice(0, 10)}.json`, backup));
}

export const questionAccountSection: AccountMenuSection = {
  id: 'question-records',
  order: 500,
  audience: 'all',
  render: () => <QuestionRecordsMenu />,
  indicator: () => <SyncDot />,
  status: ({ account }) => (account.phase === 'signed-in' ? <SyncStatus /> : null),
};
