'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRightIcon, PlayIcon } from 'lucide-react';
import { useMemo, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTags, ModalTitle, useModal } from '@/components/ui/modal';
import { resolveSource, type SourceIndex, type SourceTree } from '@/lib/doc-sources';
import {
  buildCoverage, groupSessions, pagesOf, questionHref,
  type CoverageFolder, type CoverageNode, type CoveragePage, type QuestionRecord, type RecordSession,
} from '@/lib/question-records';
import { cn } from '@/lib/utils';
import sheet from '@/styles/answer-sheet.module.css';
import styles from './records.module.css';
import page from './settings.module.css';

/*
 * The reader's answers by source. "按模块" shows one row per sidebar module
 * (its share in red, twenty answer-sheet boxes, its busiest folders) and
 * opens the module's full folder tree in a bottom sheet. "按时间" lists the
 * answers newest first, consecutive answers on one page folded into one entry.
 */

type View = 'modules' | 'timeline';

const BOXES = 20;
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

function formatDay(iso: string, now = new Date()): string {
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

/** A thin graphite bar on a faint red track. */
function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <span aria-hidden className={cn(styles.bar, className)}>
      <span data-some={value > 0 ? '' : undefined} style={{ width: `${value * 100}%` }} />
    </span>
  );
}

/** Twenty answer-sheet boxes, five percent each; the box in progress is shaded to its share. */
function Boxes({ value, label }: { value: number; label: string }) {
  const filled = value * BOXES;
  return (
    <span
      className={styles.boxes}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      {Array.from({ length: BOXES }, (_, index) => {
        const fill = Math.min(1, Math.max(0, filled - index));
        // A share too small to see still shows that something was done.
        return <i key={index} data-fill={fill > 0 ? '' : undefined} style={fill > 0 ? { '--fill': Math.max(fill, 0.2) } as CSSProperties : undefined} />;
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ modules */

function ModuleRow({ module, onOpen }: { module: CoverageFolder; onOpen(): void }) {
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
    <article className={styles.module} aria-labelledby={`module-${module.id}`}>
      <header className={styles.moduleHead}>
        <h3 id={`module-${module.id}`} className={styles.moduleName}>{module.name}</h3>
        <p className={styles.moduleCount}>
          <strong>{fmt(module.totals.answered)}</strong> / {fmt(module.questions)} 题
        </p>
      </header>
      <div className={styles.moduleBody}>
        <div className={styles.scoreRow}>
          <Boxes value={value} label={`${module.name}完成度`} />
          <span className={styles.score} data-idle={started ? undefined : ''} aria-hidden>{percent(value)}</span>
        </div>
        {folders.length ? (
          <ul className={styles.folders}>
            {folders.map((folder) => (
              <li key={folder.kind === 'folder' ? folder.id : folder.url} className={styles.folder} data-idle={touched(folder) ? undefined : ''}>
                <span className={styles.folderName}>{folder.name}</span>
                <span className={styles.folderCount}>{fmt(folder.totals.answered)} / {fmt(folder.questions)}</span>
                <Bar value={share(folder.totals.answered, folder.questions)} />
              </li>
            ))}
          </ul>
        ) : null}
        <footer className={styles.moduleFoot}>
          <span className={styles.moduleFacts}>
            <span>做过 {fmt(pagesDone)} / {fmt(pages.length)} 个页面</span>
            {module.totals.lastAt ? <span>最近一次：{formatDay(module.totals.lastAt)}</span> : null}
          </span>
          {started || !firstPage ? (
            <button type="button" className={page.button} onClick={onOpen}>查看目录<ChevronRightIcon aria-hidden /></button>
          ) : (
            <Link href={firstPage.url} prefetch={false} className={page.button}><PlayIcon aria-hidden />开始练习</Link>
          )}
        </footer>
      </div>
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
    <span className={styles.count}>
      <Bar value={share(answered, questions)} />
      <span className={styles.countText}>
        {answered > 0 ? <strong>{fmt(answered)}</strong> : fmt(answered)} / {fmt(questions)}
      </span>
    </span>
  );
}

function TreePage({ page: item, depth }: { page: CoveragePage; depth: number }) {
  const { answered, submitted, lastAt } = item.totals;
  return (
    <li>
      <SheetLink
        href={item.url}
        className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-xl py-2.5 pr-3 hover:bg-(--ui-fill-hover) focus-visible:bg-(--ui-fill-hover)', !touched(item) && 'opacity-55')}
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px]">{item.name}</span>
          {touched(item) ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              已提交 {fmt(submitted)}{lastAt ? `，${formatDay(lastAt)}` : ''}
            </span>
          ) : null}
        </span>
        <Count answered={answered} questions={item.questions} />
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
            {/* The sheet is portalled outside the page: it needs the palette for its bars. */}
            <ModalBody className={cn(sheet.palette, 'px-3 md:px-4')}>
              <div className="px-3 pb-4">
                <ModalDescription className="text-sm text-muted-foreground">
                  已作答 {fmt(module.totals.answered)} / {fmt(module.questions)} 题，已提交 {fmt(module.totals.submitted)} 题。点页面可直接跳过去接着做。
                </ModalDescription>
                <div className="mt-3"><Boxes value={share(module.totals.answered, module.questions)} label={`${module.name}完成度`} /></div>
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
      <div>
        {ordered.map((module) => (
          <ModuleRow key={module.id} module={module} onOpen={() => { setModuleId(module.id); setOpen(true); }} />
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
    <span data-state={state} className={styles.pill}>
      {record.submitted ? '已提交' : record.answered ? '作答中' : '已重做'}
    </span>
  );
}

function SessionItem({ session, index }: { session: RecordSession; index: SourceIndex | null }) {
  const [open, setOpen] = useState(false);
  const source = resolveSource(index, session.documentPath);
  const submitted = session.records.filter((record) => record.submitted).length;
  const single = session.records.length === 1 ? session.records[0] : null;
  return (
    <li className={styles.session}>
      <div className={styles.sessionRow}>
        <time dateTime={session.lastAt} className={styles.time}>{timeOf(session.lastAt)}</time>
        <Link
          href={single ? questionHref(single.documentPath, single.questionId) : session.documentPath}
          prefetch={false}
          className={styles.sessionLink}
        >
          <span className={styles.sessionTitle}>{source.page}</span>
          <span className={styles.trail}>{[source.module, ...source.folders].join(' › ')}</span>
        </Link>
        <div>
          {single ? (
            <StatePill record={single} />
          ) : (
            <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={styles.expand}>
              {fmt(session.records.length)} 题{submitted ? `，提交 ${fmt(submitted)}` : ''}
              <ChevronRightIcon aria-hidden />
            </button>
          )}
        </div>
      </div>
      {open ? (
        <ol className={styles.questions}>
          {session.records.map((record) => (
            <li key={record.questionId}>
              <Link href={questionHref(record.documentPath, record.questionId)} prefetch={false} className={styles.question}>
                <span className={styles.questionMeta}>{timeOf(record.lastAt)}</span>
                <span>{record.questionId}</span>
                {record.attempts > 1 ? <span className={styles.questionMeta}>提交 {record.attempts} 次</span> : null}
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
    <div className={styles.days}>
      {groups.map((group) => (
        <section key={group.day} aria-label={group.day}>
          <h3 className={styles.dayHead}>
            <span className={styles.dayName}>{group.day}</span>
            <span className={styles.dayCount}>{fmt(group.questions)} 题</span>
          </h3>
          <ol>
            {group.items.map((session) => (
              <SessionItem key={`${session.documentPath}\u0000${session.lastAt}`} session={session} index={index} />
            ))}
          </ol>
        </section>
      ))}
      {sessions.length > limit ? (
        <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className={cn(page.button, styles.more)}>
          显示更早的记录（还有 {fmt(sessions.length - limit)} 组）
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- panel */

function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

function ResumeLink({ record, index }: { record: QuestionRecord; index: SourceIndex | null }) {
  const source = resolveSource(index, record.documentPath);
  return (
    <Link href={questionHref(record.documentPath, record.questionId)} prefetch={false} className={styles.resume}>
      <span className={styles.resumeText}>
        <span className={styles.resumeLabel}>上次做到 {formatDay(record.lastAt)} {timeOf(record.lastAt)}</span>
        <span className={styles.resumeTitle}>{source.page}</span>
        <span className={styles.trail}>{[source.module, ...source.folders].join(' › ')}</span>
      </span>
      <span className={cn(page.button, page.primary, styles.resumeGo)}>继续做题<ArrowRight aria-hidden /></span>
    </Link>
  );
}

export function RecordsPanel({ records, tree, index, treeFailed, error }: {
  records: QuestionRecord[] | null;
  tree: SourceTree | null;
  index: SourceIndex | null;
  treeFailed: boolean;
  error: string | null;
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
      <div className={cn(styles.records, styles.loading)} aria-busy="true" aria-label="正在读取答题记录">
        {[0, 1, 2].map((item) => <i key={item} />)}
      </div>
    );
  }

  const shownRecords = module === 'all' ? records : records.filter((record) => moduleOf.get(record.documentPath) === module);
  const chips = [
    { name: 'all', label: '全部', count: records.length },
    ...coverage.filter(touched).map((item) => ({ name: item.name, label: item.name, count: item.totals.answered })),
  ];

  return (
    <div className={styles.records}>
      {error ? <p role="alert" className={page.error}>{error}</p> : null}
      {records[0] ? <ResumeLink record={records[0]} index={index} /> : null}

      <div className={styles.toolbar}>
        <div className={styles.views} role="radiogroup" aria-label="查看方式">
          {([['modules', '按模块'], ['timeline', '按时间']] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={view === value} onClick={() => setView(value)} className={styles.view}>
              <span className={page.mark} aria-hidden />{label}
            </button>
          ))}
        </div>
        {view === 'timeline' && chips.length > 2 ? (
          <div className={styles.chips} role="radiogroup" aria-label="模块">
            {chips.map((item) => (
              <button key={item.name} type="button" role="radio" aria-checked={module === item.name} onClick={() => setModule(item.name)} className={styles.chip}>
                {item.label}<span>{fmt(item.count)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {treeFailed ? <p role="status" className={styles.status}>目录信息暂时无法读取，来源按页面地址显示。</p> : null}

      {view === 'modules' ? <ModulesView coverage={coverage} /> : <TimelineView records={shownRecords} index={index} />}
    </div>
  );
}
