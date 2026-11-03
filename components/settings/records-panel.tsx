'use client';

import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { resolveSource, type SourceIndex, type SourceTree } from '@/lib/doc-sources';
import {
  buildCoverage, groupSessions, pagesOf, questionHref, totalsOf,
  type CoverageFolder, type CoverageNode, type CoveragePage, type QuestionRecord, type RecordSession,
} from '@/lib/question-records';
import { cn } from '@/lib/utils';

/*
 * The reader's answers by source. "按目录" mirrors the sidebar: one block per
 * module with a strip of cells (one per page, filled by how much of the page
 * was answered) and the folders below it. "按时间" lists answers newest first
 * with the page and folders each came from.
 */

type View = 'tree' | 'timeline';

const numberFormat = new Intl.NumberFormat('zh-CN');
const fmt = (value: number) => numberFormat.format(value);

function ratio(answered: number, questions: number) {
  return questions > 0 ? Math.min(1, answered / questions) : answered > 0 ? 1 : 0;
}

export function formatDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7 && days > 0) return `${days} 天前`;
  return date.getFullYear() === now.getFullYear()
    ? `${date.getMonth() + 1} 月 ${date.getDate()} 日`
    : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <span aria-hidden className={cn('relative block h-1 overflow-hidden rounded-full bg-(--home-border)', className)}>
      <span className="absolute inset-y-0 left-0 rounded-full bg-(--home-focus)" style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

/** One cell per page; the fill shows the answered share of its questions. */
function CoverageStrip({ module }: { module: CoverageFolder }) {
  const pages = pagesOf(module);
  return (
    <div className="flex flex-wrap gap-[3px]" role="img" aria-label={`${module.name}：${pages.filter((page) => page.totals.answered).length} / ${pages.length} 个页面做过`}>
      {pages.map((page) => {
        const value = ratio(page.totals.answered, page.questions);
        return (
          <Link
            key={page.url}
            href={page.url}
            prefetch={false}
            tabIndex={-1}
            title={`${page.name}：${page.totals.answered} / ${page.questions} 题`}
            data-filled={value > 0 ? '' : undefined}
            className="size-2.5 rounded-[3px] border border-(--home-border) data-filled:border-transparent"
            style={value > 0 ? { background: `color-mix(in oklab, var(--home-focus) ${Math.round(25 + value * 75)}%, transparent)` } : undefined}
          />
        );
      })}
    </div>
  );
}

function Counts({ node }: { node: CoverageNode }) {
  return (
    <span className="shrink-0 text-right text-xs text-(--home-muted) tabular-nums">
      <span className={cn(node.totals.answered ? 'text-(--home-foreground)' : undefined)}>{fmt(node.totals.answered)}</span> / {fmt(node.questions)}
    </span>
  );
}

function PageRow({ page, depth }: { page: CoveragePage; depth: number }) {
  const { answered, submitted, attempts, lastAt } = page.totals;
  return (
    <li>
      <Link
        href={page.url}
        prefetch={false}
        className={cn('group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg py-2 pr-2 hover:bg-(--home-active) focus-visible:bg-(--home-active)', !answered && !attempts && 'opacity-60')}
        style={{ paddingLeft: `${0.5 + depth * 1.125}rem` }}
      >
        <span className="truncate text-sm">{page.name}</span>
        <Counts node={page} />
        {answered || attempts ? (
          <span className="col-span-2 flex flex-wrap gap-x-3 text-xs text-(--home-muted)">
            <span>已提交 {fmt(submitted)}</span>
            {attempts ? <span>提交 {fmt(attempts)} 次</span> : null}
            {lastAt ? <span>{formatDay(lastAt)}</span> : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function FolderRow({ folder, depth, onlyDone, open, toggle }: {
  folder: CoverageFolder; depth: number; onlyDone: boolean; open: ReadonlySet<string>; toggle(id: string): void;
}) {
  const expanded = open.has(folder.id);
  const done = folder.totals.answered > 0 || folder.totals.attempts > 0;
  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => toggle(folder.id)}
        className={cn('grid w-full grid-cols-[1rem_minmax(0,1fr)_5rem_auto] items-center gap-2 rounded-lg py-2 pr-2 text-left hover:bg-(--home-active) focus-visible:bg-(--home-active) max-sm:grid-cols-[1rem_minmax(0,1fr)_auto]', !done && 'opacity-60')}
        style={{ paddingLeft: `${0.25 + depth * 1.125}rem` }}
      >
        <ChevronRightIcon className={cn('size-4 text-(--home-muted) transition-transform', expanded && 'rotate-90')} />
        <span className="truncate text-sm font-medium">{folder.name}</span>
        <Meter value={ratio(folder.totals.answered, folder.questions)} className="max-sm:hidden" />
        <Counts node={folder} />
      </button>
      {expanded ? <NodeList nodes={folder.children} depth={depth + 1} onlyDone={onlyDone} open={open} toggle={toggle} /> : null}
    </li>
  );
}

function NodeList({ nodes, depth, onlyDone, open, toggle }: {
  nodes: CoverageNode[]; depth: number; onlyDone: boolean; open: ReadonlySet<string>; toggle(id: string): void;
}) {
  const shown = onlyDone ? nodes.filter((node) => node.totals.answered > 0 || node.totals.attempts > 0) : nodes;
  if (!shown.length) return null;
  return (
    <ul>
      {shown.map((node) => node.kind === 'page'
        ? <PageRow key={node.url} page={node} depth={depth} />
        : <FolderRow key={node.id} folder={node} depth={depth} onlyDone={onlyDone} open={open} toggle={toggle} />)}
    </ul>
  );
}

function ModuleBlock({ module, onlyDone, open, toggle }: {
  module: CoverageFolder; onlyDone: boolean; open: ReadonlySet<string>; toggle(id: string): void;
}) {
  const value = ratio(module.totals.answered, module.questions);
  const expanded = open.has(module.id);
  return (
    <section className="border-t border-(--home-border) py-5 first:border-t-0" aria-label={module.name}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-lg font-semibold tracking-tight">{module.name}</h3>
        <p className="text-sm text-(--home-muted) tabular-nums">
          <span className="text-(--home-foreground)">{fmt(module.totals.answered)}</span> / {fmt(module.questions)} 题
          <span className="ml-3">{(value * 100).toFixed(value > 0 && value < 0.01 ? 1 : 0)}%</span>
        </p>
      </div>
      <Meter value={value} className="mt-2.5" />
      <div className="mt-3"><CoverageStrip module={module} /></div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => toggle(module.id)}
        className="mt-3 inline-flex items-center gap-1 rounded-md text-sm text-(--home-muted) hover:text-(--home-foreground)"
      >
        <ChevronRightIcon className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
        {expanded ? '收起目录' : `展开目录（${fmt(module.totals.pages)} 个页面做过）`}
      </button>
      {expanded ? (
        <div className="mt-2 -mx-2">
          <NodeList nodes={module.children} depth={0} onlyDone={onlyDone} open={open} toggle={toggle} />
          {onlyDone && !module.totals.answered && !module.totals.attempts ? (
            <p className="px-2 py-2 text-sm text-(--home-muted)">这个模块还没有作答记录。</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TreeView({ modules, onlyDone }: { modules: CoverageFolder[]; onlyDone: boolean }) {
  // Modules the reader worked in start expanded, the rest stay folded.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(modules.filter((module) => module.totals.answered).map((module) => module.id)));
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  if (!modules.length) return <Empty>当前筛选下没有题目。</Empty>;
  return <div>{modules.map((module) => <ModuleBlock key={module.id} module={module} onlyDone={onlyDone} open={open} toggle={toggle} />)}</div>;
}

const PAGE_SIZE = 40;

function StatePill({ record }: { record: QuestionRecord }) {
  const state = record.submitted ? 'submitted' : record.answered ? 'draft' : 'reset';
  return (
    <span
      data-state={state}
      className="shrink-0 rounded-full px-2 text-xs leading-5 data-[state=draft]:border data-[state=draft]:border-(--home-border) data-[state=draft]:text-(--home-muted) data-[state=reset]:text-(--home-muted) data-[state=submitted]:bg-(--home-accent) data-[state=submitted]:text-(--home-accent-foreground)"
    >
      {record.submitted ? '已提交' : record.answered ? '作答中' : '已重做'}
    </span>
  );
}

/** Consecutive answers on one page, shown as one entry that unfolds into its questions. */
function SessionItem({ session, index }: { session: RecordSession; index: SourceIndex | null }) {
  const [open, setOpen] = useState(false);
  const source = resolveSource(index, session.documentPath);
  const submitted = session.records.filter((record) => record.submitted).length;
  const first = session.records.at(-1)!;
  const single = session.records.length === 1;
  return (
    <li className="-mx-2">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg px-2 py-2 hover:bg-(--home-active)">
        <time dateTime={session.lastAt} className="pt-px text-sm text-(--home-muted) tabular-nums">{timeOf(session.lastAt)}</time>
        <Link
          href={single ? questionHref(first.documentPath, first.questionId) : session.documentPath}
          prefetch={false}
          className="min-w-0 rounded-sm hover:underline focus-visible:underline"
        >
          <span className="block truncate text-sm">{source.page}</span>
          <span className="block truncate text-xs text-(--home-muted)">{[source.module, ...source.folders].join(' › ')}</span>
        </Link>
        {single ? (
          <StatePill record={first} />
        ) : (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-(--home-border) px-2 text-xs leading-5 text-(--home-muted) tabular-nums hover:text-(--home-foreground)"
          >
            {fmt(session.records.length)} 题{submitted ? `，已提交 ${fmt(submitted)}` : ''}
            <ChevronRightIcon className={cn('size-3 transition-transform', open && 'rotate-90')} />
          </button>
        )}
      </div>
      {open ? (
        <ol className="mb-1 ml-[3.75rem] border-l border-(--home-border) pl-3">
          {session.records.map((record) => (
            <li key={record.questionId}>
              <Link
                href={questionHref(record.documentPath, record.questionId)}
                prefetch={false}
                className="flex items-center gap-3 rounded-md px-2 py-1 text-sm hover:bg-(--home-active)"
              >
                <span className="w-10 shrink-0 text-xs text-(--home-muted) tabular-nums">{timeOf(record.lastAt)}</span>
                <span className="min-w-0 flex-1 truncate">{record.questionId}</span>
                {record.attempts > 1 ? <span className="text-xs text-(--home-muted) tabular-nums">提交 {record.attempts} 次</span> : null}
                <StatePill record={record} />
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function TimelineView({ records, index }: { records: QuestionRecord[]; index: SourceIndex | null }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sessions = useMemo(() => groupSessions(records, (record) => formatDay(record.lastAt)), [records]);
  const groups = useMemo(() => {
    const result: { day: string; items: RecordSession[] }[] = [];
    for (const session of sessions.slice(0, limit)) {
      const last = result.at(-1);
      if (last?.day === session.group) last.items.push(session);
      else result.push({ day: session.group, items: [session] });
    }
    return result;
  }, [sessions, limit]);
  if (!records.length) return <Empty>当前筛选下还没有作答记录。</Empty>;
  return (
    <div>
      {groups.map((group) => (
        <section key={group.day} className="border-t border-(--home-border) pt-3 pb-2 first:border-t-0" aria-label={group.day}>
          <h3 className="pb-1 text-sm font-medium text-(--home-muted)">{group.day}</h3>
          <ol>
            {group.items.map((session) => <SessionItem key={`${session.documentPath}\u0000${session.lastAt}`} session={session} index={index} />)}
          </ol>
        </section>
      ))}
      {sessions.length > limit ? (
        <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="mt-2 w-full rounded-lg border border-(--home-border) py-2 text-sm text-(--home-muted) hover:bg-(--home-active) hover:text-(--home-foreground)">
          显示更早的记录（还有 {fmt(sessions.length - limit)} 组）
        </button>
      ) : null}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-(--home-muted)">{children}</p>;
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly { value: T; label: ReactNode }[]; onChange(value: T): void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-(--home-border) p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className="rounded-full px-3 py-1 text-sm text-(--home-muted) aria-checked:bg-(--home-foreground) aria-checked:text-(--home-background)"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RecordsPanel({ records, tree, index, treeFailed }: {
  records: QuestionRecord[] | null;
  tree: SourceTree | null;
  index: SourceIndex | null;
  treeFailed: boolean;
}) {
  const [view, setView] = useState<View>('tree');
  const [module, setModule] = useState<string>('all');
  const [onlyDone, setOnlyDone] = useState(true);

  const coverage = useMemo(
    () => (records && (tree || treeFailed) ? buildCoverage(tree ?? { modules: [] }, records, index ?? new Map()) : null),
    [records, tree, treeFailed, index],
  );
  const totals = useMemo(() => (records ? totalsOf(records) : null), [records]);
  const moduleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records ?? []) map.set(record.documentPath, resolveSource(index, record.documentPath).module);
    return map;
  }, [records, index]);

  if (!records || !coverage || !totals) {
    return <div className="space-y-3 py-6" aria-busy="true" aria-label="正在读取答题记录">
      {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-(--home-active)" />)}
    </div>;
  }

  const worked = coverage.filter((item) => item.totals.answered || item.totals.attempts);
  const shownModules = coverage.filter((item) => (module === 'all' ? true : item.name === module));
  const shownRecords = module === 'all' ? records : records.filter((record) => moduleOf.get(record.documentPath) === module);
  const latest = records[0];
  const latestSource = latest ? resolveSource(index, latest.documentPath) : null;

  return (
    <div>
      <div className="rounded-(--home-radius) border border-(--home-border) bg-(--home-surface) px-5 py-5 sm:px-6">
        {totals.answered || totals.attempts ? (
          <>
            <p className="text-2xl leading-snug font-semibold tracking-tight sm:text-[1.75rem]">
              已作答 {fmt(totals.answered)} 题，分布在 {fmt(worked.length)} 个模块、{fmt(totals.pages)} 个页面
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-(--home-muted) [&_dt]:shrink-0">
              <div className="flex gap-1.5"><dt>已提交</dt><dd className="text-(--home-foreground) tabular-nums">{fmt(totals.submitted)}</dd></div>
              <div className="flex gap-1.5"><dt>累计提交</dt><dd className="text-(--home-foreground) tabular-nums">{fmt(totals.attempts)} 次</dd></div>
              {latest && latestSource ? (
                <div className="flex min-w-0 gap-1.5">
                  <dt>最近</dt>
                  <dd className="min-w-0 truncate text-(--home-foreground)">
                    <Link href={questionHref(latest.documentPath, latest.questionId)} prefetch={false} className="hover:underline">
                      {formatDay(latest.lastAt)} {timeOf(latest.lastAt)}，{[latestSource.module, ...latestSource.folders, latestSource.page].join(' › ')}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : (
          <>
            <p className="text-2xl font-semibold tracking-tight">还没有作答记录</p>
            <p className="mt-2 text-sm text-(--home-muted)">在任意文档里做题，记录会按模块和目录汇总到这里。</p>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented<View> label="查看方式" value={view} onChange={setView} options={[{ value: 'tree', label: '按目录' }, { value: 'timeline', label: '按时间' }]} />
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 py-0.5" role="radiogroup" aria-label="模块">
          {[{ name: 'all', label: '全部', count: totals.answered }, ...coverage.map((item) => ({ name: item.name, label: item.name, count: item.totals.answered }))].map((item) => (
            <button
              key={item.name}
              type="button"
              role="radio"
              aria-checked={module === item.name}
              onClick={() => setModule(item.name)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-(--home-active) px-3 py-1 text-sm text-(--home-muted) hover:text-(--home-foreground) aria-checked:bg-(--home-accent) aria-checked:text-(--home-accent-foreground)"
            >
              {item.label}
              <span className="tabular-nums opacity-70">{fmt(item.count)}</span>
            </button>
          ))}
        </div>
        {view === 'tree' ? (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-(--home-muted) select-none">
            <input type="checkbox" checked={onlyDone} onChange={(event) => setOnlyDone(event.target.checked)} className="size-4 accent-(--home-focus)" />
            目录中只看做过的
          </label>
        ) : null}
      </div>

      {treeFailed ? (
        <p role="status" className="mt-3 text-sm text-(--home-muted)">目录信息暂时无法读取，来源按页面地址显示。</p>
      ) : null}

      <div className="mt-2">
        {view === 'tree'
          ? <TreeView key={module} modules={shownModules} onlyDone={onlyDone} />
          : <TimelineView records={shownRecords} index={index} />}
      </div>
    </div>
  );
}
