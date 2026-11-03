'use client';

import Link from 'next/link';
import { ChevronRightIcon, PlayIcon } from 'lucide-react';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTags, ModalTitle, useModal } from '@/components/ui/modal';
import { resolveSource, type SourceIndex, type SourceTree } from '@/lib/doc-sources';
import {
  buildCoverage, groupSessions, pagesOf, questionHref,
  type CoverageFolder, type CoverageNode, type CoveragePage, type QuestionRecord, type RecordSession,
} from '@/lib/question-records';
import { cn } from '@/lib/utils';

/*
 * The reader's answers by source. "按模块" shows one card per sidebar module
 * (progress, its busiest folders) and opens the module's full folder tree in
 * a bottom sheet. "按时间" lists the answers newest first, consecutive answers
 * on one page folded into one entry.
 */

type View = 'modules' | 'timeline';

const numberFormat = new Intl.NumberFormat('zh-CN');
const fmt = (value: number) => numberFormat.format(value);
const touched = (node: CoverageNode) => node.totals.answered > 0 || node.totals.attempts > 0;

function share(answered: number, questions: number) {
  return questions > 0 ? Math.min(1, answered / questions) : answered > 0 ? 1 : 0;
}

function percent(value: number) {
  if (value <= 0) return '0%';
  if (value < 0.01) return '<1%';
  return `${Math.round(value * 100)}%`;
}

export function formatDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days > 1 && days < 7) return `${days} 天前`;
  return date.getFullYear() === now.getFullYear()
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

export function Meter({ value, size, className, label }: { value: number; size?: 'sm'; className?: string; label?: string }) {
  return (
    <span
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(value * 100) : undefined}
      aria-hidden={label ? undefined : true}
      data-size={size}
      className={cn('settings-meter', className)}
    >
      <span data-some={value > 0 ? '' : undefined} style={{ width: `${value * 100}%` }} />
    </span>
  );
}

/* ------------------------------------------------------------------ modules */

function ModuleCard({ module, onOpen }: { module: CoverageFolder; onOpen(): void }) {
  const pages = pagesOf(module);
  const pagesDone = pages.filter(touched).length;
  const value = share(module.totals.answered, module.questions);
  const started = touched(module);
  // The folders the reader worked in most, then the rest in sidebar order.
  const folders = module.children
    .map((child, order) => ({ child, order }))
    .filter(({ child }) => child.questions > 0)
    .sort((a, b) => b.child.totals.answered - a.child.totals.answered || a.order - b.order)
    .map(({ child }) => child)
    .slice(0, 4);
  const firstPage = pages[0];

  return (
    <article className="settings-card flex flex-col p-5 sm:p-6" data-interactive="" aria-labelledby={`module-${module.id}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`module-${module.id}`} className="truncate text-lg font-semibold tracking-tight">{module.name}</h3>
          <p className="mt-0.5 text-[13px] text-(--home-muted)">{fmt(pagesDone)} / {fmt(pages.length)} 个页面做过</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-[28px] leading-none font-semibold tracking-tight', !started && 'text-(--home-muted)')}>{percent(value)}</p>
          <p className="mt-1.5 text-[13px] text-(--home-muted)">
            <span className="text-(--home-foreground)">{fmt(module.totals.answered)}</span> / {fmt(module.questions)} 题
          </p>
        </div>
      </header>
      <Meter value={value} className="mt-4" label={`${module.name}完成度`} />
      <ul className="mt-5 space-y-3">
        {folders.map((folder) => (
          <li key={folder.kind === 'folder' ? folder.id : folder.url} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5', !touched(folder) && 'opacity-55')}>
            <span className="truncate text-sm">{folder.name}</span>
            <span className="text-xs text-(--home-muted) tabular-nums">{fmt(folder.totals.answered)} / {fmt(folder.questions)}</span>
            <Meter value={share(folder.totals.answered, folder.questions)} size="sm" className="col-span-2" />
          </li>
        ))}
      </ul>
      <footer className="mt-auto flex items-center justify-between gap-3 pt-6">
        <span className="text-[13px] text-(--home-muted)">
          {module.totals.lastAt ? `最近一次：${formatDay(module.totals.lastAt)}` : '还没开始'}
        </span>
        {started || !firstPage ? (
          <button type="button" className="settings-btn" onClick={onOpen}>查看目录<ChevronRightIcon /></button>
        ) : (
          <Link href={firstPage.url} prefetch={false} className="settings-btn" data-variant="accent"><PlayIcon />开始练习</Link>
        )}
      </footer>
    </article>
  );
}

/** Follows the link and closes the whole sheet. */
function SheetLink(props: ComponentProps<typeof Link>) {
  const modal = useModal();
  return <Link prefetch={false} {...props} onClick={() => modal?.closeAll({ returnFocus: false })} />;
}

function Count({ answered, questions }: { answered: number; questions: number }) {
  return (
    <span className="flex items-center gap-3">
      <Meter value={share(answered, questions)} size="sm" className="w-20 max-sm:hidden" />
      <span className="min-w-[5.5rem] text-right text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
        <span className={cn(answered > 0 && 'text-foreground')}>{fmt(answered)}</span> / {fmt(questions)}
      </span>
    </span>
  );
}

function TreePage({ page, depth }: { page: CoveragePage; depth: number }) {
  const { answered, submitted, lastAt } = page.totals;
  return (
    <li>
      <SheetLink
        href={page.url}
        className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-xl py-2.5 pr-3 hover:bg-(--ui-fill-hover) focus-visible:bg-(--ui-fill-hover)', !touched(page) && 'opacity-55')}
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px]">{page.name}</span>
          {touched(page) ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              已提交 {fmt(submitted)}{lastAt ? `，${formatDay(lastAt)}` : ''}
            </span>
          ) : null}
        </span>
        <Count answered={answered} questions={page.questions} />
      </SheetLink>
    </li>
  );
}

function TreeFolder({ folder, depth, onlyDone }: { folder: CoverageFolder; depth: number; onlyDone: boolean }) {
  const [open, setOpen] = useState(depth === 0 && touched(folder));
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn('grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl py-2.5 pr-3 text-left hover:bg-(--ui-fill-hover) focus-visible:bg-(--ui-fill-hover)', !touched(folder) && 'opacity-55')}
        style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
      >
        <ChevronRightIcon className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="truncate text-[15px] font-medium">{folder.name}</span>
        <Count answered={folder.totals.answered} questions={folder.questions} />
      </button>
      {open ? <TreeNodes nodes={folder.children} depth={depth + 1} onlyDone={onlyDone} /> : null}
    </li>
  );
}

function TreeNodes({ nodes, depth, onlyDone }: { nodes: CoverageNode[]; depth: number; onlyDone: boolean }) {
  const shown = onlyDone ? nodes.filter(touched) : nodes;
  if (!shown.length) return null;
  return (
    <ul>
      {shown.map((node) => node.kind === 'page'
        ? <TreePage key={node.url} page={node} depth={depth} />
        : <TreeFolder key={node.id} folder={node} depth={depth} onlyDone={onlyDone} />)}
    </ul>
  );
}

function ModuleSheet({ module, open, onOpenChange }: { module: CoverageFolder | null; open: boolean; onOpenChange(open: boolean): void }) {
  const [onlyDone, setOnlyDone] = useState(true);
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md" className="md:min-h-[min(28rem,calc(100dvh-4rem))]">
        {module ? (
          <>
            <ModalHeader>
              <ModalTitle>{module.name}</ModalTitle>
              <ModalTags role="radiogroup" aria-label="显示范围">
                {([[true, '做过的'], [false, '全部目录']] as const).map(([option, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={onlyDone === option}
                    onClick={() => setOnlyDone(option)}
                    className={cn('inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm transition-colors', onlyDone === option ? 'bg-foreground text-background' : 'bg-(--ui-fill) text-muted-foreground hover:text-foreground')}
                  >
                    {label}
                  </button>
                ))}
              </ModalTags>
            </ModalHeader>
            <ModalBody className="px-3 md:px-4">
              <div className="px-3 pb-4">
                <ModalDescription className="text-sm text-muted-foreground">
                  已作答 {fmt(module.totals.answered)} / {fmt(module.questions)} 题，已提交 {fmt(module.totals.submitted)} 题。点页面可直接跳过去接着做。
                </ModalDescription>
                <Meter value={share(module.totals.answered, module.questions)} className="mt-3" />
              </div>
              {onlyDone && !touched(module)
                ? <p className="px-3 py-10 text-center text-sm text-muted-foreground">这个模块还没有作答记录。</p>
                : <TreeNodes key={String(onlyDone)} nodes={module.children} depth={0} onlyDone={onlyDone} />}
            </ModalBody>
          </>
        ) : null}
      </ModalContent>
    </Modal>
  );
}

function ModulesView({ coverage }: { coverage: CoverageFolder[] }) {
  const [open, setOpen] = useState(false);
  // The id stays set while the sheet animates closed, so its content does not vanish mid-slide.
  const [moduleId, setModuleId] = useState<string | null>(null);
  const ordered = useMemo(() => [...coverage].sort((a, b) => Number(touched(b)) - Number(touched(a))), [coverage]);
  const current = coverage.find((module) => module.id === moduleId) ?? null;
  if (!coverage.length) return <Empty>还没有可统计的题目。</Empty>;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {ordered.map((module) => (
          <ModuleCard key={module.id} module={module} onOpen={() => { setModuleId(module.id); setOpen(true); }} />
        ))}
      </div>
      <ModuleSheet key={moduleId ?? ''} module={current} open={open && current !== null} onOpenChange={setOpen} />
    </>
  );
}

/* ----------------------------------------------------------------- timeline */

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

function SessionItem({ session, index, last }: { session: RecordSession; index: SourceIndex | null; last: boolean }) {
  const [open, setOpen] = useState(false);
  const source = resolveSource(index, session.documentPath);
  const submitted = session.records.filter((record) => record.submitted).length;
  const single = session.records.length === 1 ? session.records[0] : null;
  return (
    <li className="relative pl-6">
      <span aria-hidden className={cn('absolute top-0 left-[7px] w-px bg-(--home-border)', last ? 'h-5' : 'bottom-0')} />
      <span aria-hidden className="absolute top-[17px] left-[3px] size-[9px] rounded-full bg-(--set-meter-fill) ring-4 ring-(--home-elevated)" />
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 rounded-xl px-3 py-2.5 hover:bg-(--home-active) sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]">
        <time dateTime={session.lastAt} className="pt-0.5 text-[13px] text-(--home-muted) tabular-nums">{timeOf(session.lastAt)}</time>
        <Link
          href={single ? questionHref(single.documentPath, single.questionId) : session.documentPath}
          prefetch={false}
          className="min-w-0 rounded-sm hover:underline focus-visible:underline"
        >
          <span className="block truncate text-[15px] font-medium">{source.page}</span>
          <span className="mt-0.5 block truncate text-xs text-(--home-muted)">{[source.module, ...source.folders].join(' › ')}</span>
        </Link>
        {/* Under the title on a phone, so long page names keep their room. */}
        <div className="col-start-2 mt-2 justify-self-start sm:col-start-3 sm:mt-0 sm:justify-self-end">
          {single ? (
            <StatePill record={single} />
          ) : (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1 rounded-full bg-(--home-active) pr-1.5 pl-2.5 text-xs leading-6 whitespace-nowrap text-(--home-muted) tabular-nums hover:text-(--home-foreground)"
            >
              {fmt(session.records.length)} 题{submitted ? ` · 提交 ${fmt(submitted)}` : ''}
              <ChevronRightIcon className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
            </button>
          )}
        </div>
      </div>
      {open ? (
        <ol className="mb-2 ml-3 space-y-0.5 sm:ml-14">
          {session.records.map((record) => (
            <li key={record.questionId}>
              <Link
                href={questionHref(record.documentPath, record.questionId)}
                prefetch={false}
                className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm hover:bg-(--home-active)"
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

const PAGE_SIZE = 30;

function TimelineView({ records, index }: { records: QuestionRecord[]; index: SourceIndex | null }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sessions = useMemo(() => groupSessions(records, (record) => formatDay(record.lastAt)), [records]);
  const groups = useMemo(() => {
    const result: { day: string; items: RecordSession[]; questions: number }[] = [];
    for (const session of sessions.slice(0, limit)) {
      const last = result.at(-1);
      if (last?.day === session.group) { last.items.push(session); last.questions += session.records.length; }
      else result.push({ day: session.group, items: [session], questions: session.records.length });
    }
    return result;
  }, [sessions, limit]);
  if (!records.length) return <Empty>这里还没有作答记录。</Empty>;
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.day} className="settings-card px-2 pt-4 pb-2 sm:px-3" aria-label={group.day}>
          <h3 className="flex items-baseline justify-between px-3 pb-2">
            <span className="text-[15px] font-semibold">{group.day}</span>
            <span className="text-[13px] text-(--home-muted)">{fmt(group.questions)} 题</span>
          </h3>
          <ol className="pl-1">
            {group.items.map((session, position) => (
              <SessionItem key={`${session.documentPath}\u0000${session.lastAt}`} session={session} index={index} last={position === group.items.length - 1} />
            ))}
          </ol>
        </section>
      ))}
      {sessions.length > limit ? (
        <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="settings-btn w-full">
          显示更早的记录（还有 {fmt(sessions.length - limit)} 组）
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- panel */

function Empty({ children }: { children: ReactNode }) {
  return <p className="settings-card px-6 py-14 text-center text-sm text-(--home-muted)">{children}</p>;
}

function ResumeCard({ record, index }: { record: QuestionRecord; index: SourceIndex | null }) {
  const source = resolveSource(index, record.documentPath);
  return (
    <div className="settings-card flex flex-wrap items-center gap-x-5 gap-y-4 p-5 sm:flex-nowrap sm:p-6">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-(--home-muted)">上次做到 {formatDay(record.lastAt)} {timeOf(record.lastAt)}</p>
        <p className="mt-1 truncate text-lg font-semibold tracking-tight">{source.page}</p>
        <p className="mt-0.5 truncate text-[13px] text-(--home-muted)">{[source.module, ...source.folders].join(' › ')}</p>
      </div>
      <Link href={questionHref(record.documentPath, record.questionId)} prefetch={false} className="settings-btn max-sm:w-full" data-variant="primary">
        <PlayIcon />继续做题
      </Link>
    </div>
  );
}

export function RecordsPanel({ records, tree, index, treeFailed }: {
  records: QuestionRecord[] | null;
  tree: SourceTree | null;
  index: SourceIndex | null;
  treeFailed: boolean;
}) {
  const [view, setView] = useState<View>('modules');
  const [module, setModule] = useState<string>('all');

  const coverage = useMemo(
    () => (records && (tree || treeFailed) ? buildCoverage(tree ?? { modules: [] }, records, index ?? new Map()) : null),
    [records, tree, treeFailed, index],
  );
  const moduleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records ?? []) map.set(record.documentPath, resolveSource(index, record.documentPath).module);
    return map;
  }, [records, index]);

  if (!records || !coverage) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="正在读取答题记录">
        {[0, 1, 2, 3].map((item) => <div key={item} className="settings-card h-64 animate-pulse bg-(--home-active)" />)}
      </div>
    );
  }

  const shownRecords = module === 'all' ? records : records.filter((record) => moduleOf.get(record.documentPath) === module);
  const chips = [
    { name: 'all', label: '全部', count: records.length },
    ...coverage.filter(touched).map((item) => ({ name: item.name, label: item.name, count: item.totals.answered })),
  ];

  return (
    <div className="space-y-5">
      {records[0] ? <ResumeCard record={records[0]} index={index} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="settings-tabs" role="radiogroup" aria-label="查看方式">
          {([['modules', '按模块'], ['timeline', '按时间']] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={view === value} data-active={view === value ? '' : undefined} onClick={() => setView(value)} className="settings-tab h-8 px-3.5">
              {label}
            </button>
          ))}
        </div>
        {view === 'timeline' && chips.length > 2 ? (
          <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]" role="radiogroup" aria-label="模块">
            {chips.map((item) => (
              <button key={item.name} type="button" role="radio" aria-checked={module === item.name} onClick={() => setModule(item.name)} className="settings-chip">
                {item.label}<span className="settings-chip-count">{fmt(item.count)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {treeFailed ? <p role="status" className="text-sm text-(--home-muted)">目录信息暂时无法读取，来源按页面地址显示。</p> : null}

      {view === 'modules' ? <ModulesView coverage={coverage} /> : <TimelineView records={shownRecords} index={index} />}
    </div>
  );
}
