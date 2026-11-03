'use client';

import '@/styles/settings.css';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import {
  ChartNoAxesColumnIcon, CheckIcon, CloudIcon, CloudUploadIcon, DatabaseIcon, DownloadIcon, FileInputIcon, GlobeIcon,
  HardDriveIcon, InfoIcon, LaptopIcon, LibraryBigIcon, LogInIcon, LogOutIcon, NotebookPenIcon, PaletteIcon,
  RefreshCwIcon, ShieldAlertIcon, ShieldCheckIcon, StarIcon, TagIcon, UserRoundIcon,
} from 'lucide-react';
import { SignInDialog, useAccount } from '@/components/account';
import { describeSync, downloadBackup, importGuestRecords } from '@/components/question/account-section';
import { useQuestionDatabase } from '@/components/question/database-context';
import { UserTagChip } from '@/components/question/marks/question-marks';
import { useUserTags } from '@/components/question/marks/use-marks';
import { useQuestionRecords, type QuestionRecordsState } from '@/components/question/use-question-records';
import { accountInitials, accountLabel } from '@/lib/account/types';
import { useSourceTree } from '@/lib/doc-sources-client';
import { streakOf, totalsOf } from '@/lib/question-records';
import type { QuestionMark } from '@/lib/question-store/types';
import { siteConfig } from '@/lib/site-config';
import { cn } from '@/lib/utils';
import { ActivityHeatmap } from './activity-heatmap';
import { RecordsPanel } from './records-panel';

/*
 * Everything about the reader rather than the documents. A profile header
 * (who, sync state, the headline numbers and the practice calendar) sits
 * above tabs: records by source, account and sync, favourites and tags,
 * appearance, local data, and the site. The tab follows the URL hash, so
 * /settings#account opens that tab and Back returns to the previous one.
 */

const TABS = [
  { id: 'records', label: '学习记录', icon: ChartNoAxesColumnIcon },
  { id: 'account', label: '账号与同步', icon: CloudIcon },
  { id: 'library', label: '收藏与标签', icon: StarIcon },
  { id: 'appearance', label: '外观', icon: PaletteIcon },
  { id: 'data', label: '数据与存储', icon: DatabaseIcon },
  { id: 'about', label: '关于', icon: InfoIcon },
] as const;

type TabId = typeof TABS[number]['id'];

const numberFormat = new Intl.NumberFormat('zh-CN');
const fmt = (value: number | null | undefined) => (value === null || value === undefined ? '–' : numberFormat.format(value));
const noop = () => () => {};

function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function useTab(): [TabId, (tab: TabId) => void] {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => '');
  const tab = (TABS.find((item) => item.id === hash)?.id ?? 'records') as TabId;
  const select = useCallback((next: TabId) => {
    // No element carries a tab's id, so changing the hash never scrolls.
    window.location.hash = next;
  }, []);
  return [tab, select];
}

/* --------------------------------------------------------------- building blocks */

function PanelSection({ title, description, children, action }: { title: string; description?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-(--home-muted)">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ icon: Icon, title, hint, children }: { icon?: ComponentType<{ className?: string }>; title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6 [&+&]:border-t [&+&]:border-(--home-border)">
      {Icon ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--home-active) text-(--home-muted)"><Icon className="size-[18px]" /></span>
      ) : null}
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-[15px] font-medium">{title}</div>
        {hint ? <div className="mt-0.5 text-[13px] leading-relaxed text-(--home-muted)">{hint}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

const DOT = {
  ok: 'bg-emerald-500', busy: 'bg-sky-500 animate-pulse', muted: 'bg-(--home-muted)', warn: 'bg-amber-500', error: 'bg-destructive',
} as const;

function useGuestRecordCount() {
  const context = useQuestionDatabase();
  const [count, setCount] = useState(0);
  const database = context?.database ?? null;
  const namespace = context?.namespace ?? 'guest';
  useEffect(() => {
    if (!database || namespace === 'guest') return;
    let disposed = false;
    const refresh = () => {
      void database.answers.summary('guest').then((guest) => { if (!disposed) setCount(guest.answered + guest.attempts); }).catch(() => undefined);
    };
    refresh();
    const unsubscribe = database.subscribe((change) => { if (change.namespace === 'guest') refresh(); });
    return () => { disposed = true; unsubscribe(); };
  }, [database, namespace]);
  return namespace === 'guest' ? 0 : count;
}

/* ------------------------------------------------------------------------ hero */

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="min-w-0 sm:border-l sm:border-(--home-border) sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
      <dd className="text-[30px] leading-none font-semibold tracking-tight sm:text-[34px]">
        {value}{unit ? <span className="ml-1 text-sm font-normal text-(--home-muted)">{unit}</span> : null}
      </dd>
      <dt className="mt-2 text-[13px] text-(--home-muted)">{label}</dt>
    </div>
  );
}

function Hero({ state, onSignIn }: { state: QuestionRecordsState; onSignIn(): void }) {
  const account = useAccount();
  const context = useQuestionDatabase();
  const { records, activity } = state;
  const totals = useMemo(() => (records ? totalsOf(records) : null), [records]);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const streak = useMemo(() => (activity && mounted ? streakOf(activity) : null), [activity, mounted]);
  const signedIn = account.phase === 'signed-in' ? account.user : null;
  const sync = describeSync(context);

  const status = signedIn
    ? sync ?? { tone: 'ok' as const, text: '已登录' }
    : account.phase === 'disabled'
      ? { tone: 'muted' as const, text: '云端账号未启用，记录保存在本机' }
      : account.phase === 'loading'
        ? { tone: 'muted' as const, text: '正在读取登录状态…' }
        : { tone: 'muted' as const, text: '访客 · 记录只保存在这个浏览器' };

  return (
    <section className="settings-hero p-5 sm:p-8 lg:p-10" aria-label="学习概览">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-4">
            <span className="settings-avatar" data-guest={signedIn ? undefined : ''} aria-hidden>
              {signedIn ? accountInitials(signedIn) : <UserRoundIcon className="size-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold tracking-tight">{signedIn ? accountLabel(signedIn) : '访客'}</p>
              <p className="mt-1 inline-flex max-w-full items-center gap-2 text-[13px] text-(--home-muted)" role="status">
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[status.tone])} />
                <span className="truncate">{status.text}</span>
              </p>
            </div>
            {!signedIn && account.phase === 'guest' ? (
              <button type="button" className="settings-btn max-sm:w-full" data-variant="primary" onClick={onSignIn}>
                <LogInIcon />登录同步记录
              </button>
            ) : null}
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4 lg:mt-10">
            <Stat value={fmt(totals?.answered)} unit="题" label="已作答" />
            <Stat value={fmt(totals?.submitted)} unit="题" label="已提交" />
            <Stat value={fmt(activity ? activity.size : null)} unit="天" label="做过题的日子" />
            <Stat value={fmt(streak)} unit="天" label="连续做题" />
          </dl>
        </div>
        <div className="min-w-0 border-t border-(--home-border) pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
          <ActivityHeatmap activity={activity} />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- panels */

function RecordsTab({ state }: { state: QuestionRecordsState }) {
  const { records, error } = state;
  const { tree, index, failed } = useSourceTree();
  return (
    <PanelSection
      title="学习记录"
      description="每道题都按它所在的页面归到侧边栏的模块和目录下；页面改名或调整目录后，旧记录也会显示新的位置。"
    >
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <RecordsPanel records={records} tree={tree} index={index} treeFailed={failed} />
    </PanelSection>
  );
}

function AccountTab({ onSignIn }: { onSignIn(): void }) {
  const account = useAccount();
  const context = useQuestionDatabase();
  const guestRecords = useGuestRecordCount();
  const [message, setMessage] = useState<string | null>(null);
  const signedIn = account.phase === 'signed-in' ? account.user : null;
  const sync = describeSync(context);
  const syncing = context?.status.phase === 'syncing';

  return (
    <div className="space-y-8">
      <PanelSection title="账号" description="登录后，提交、重做、收藏和注释会同步到云端，换设备也能接着做。">
        <div className="settings-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <span className="settings-avatar" data-guest={signedIn ? undefined : ''} aria-hidden>
              {signedIn ? accountInitials(signedIn) : <UserRoundIcon className="size-6" />}
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-[17px] font-semibold">{signedIn ? accountLabel(signedIn) : '未登录'}</p>
              <p className="mt-0.5 text-[13px] text-(--home-muted)">
                {signedIn ? '邮箱账号' : account.phase === 'disabled' ? '这个站点没有启用云端账号，记录只保存在本机。' : account.phase === 'loading' ? '正在读取登录状态…' : '用邮箱登录，不需要密码。'}
              </p>
            </div>
            {signedIn ? (
              <button type="button" className="settings-btn" onClick={() => { void account.signOut().catch(() => undefined); }}><LogOutIcon />退出登录</button>
            ) : (
              <button type="button" className="settings-btn" data-variant="primary" disabled={account.phase !== 'guest'} onClick={onSignIn}><LogInIcon />登录 / 注册</button>
            )}
          </div>
          {signedIn ? (
            <div className="border-t border-(--home-border) bg-(--home-surface) px-5 py-3 text-[13px] text-(--home-muted) sm:px-6">
              退出后本机记录仍保留在这个浏览器，再次登录同一账号即可继续同步。
            </div>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="同步">
        <div className="settings-card">
          <Row
            icon={CloudUploadIcon}
            title="同步状态"
            hint={signedIn && sync ? (
              <span className="inline-flex items-center gap-1.5" role="status">
                <span aria-hidden className={cn('size-1.5 rounded-full', DOT[sync.tone])} />{sync.text}
              </span>
            ) : '登录后开启云端同步。'}
          >
            {signedIn ? (
              <button type="button" className="settings-btn" disabled={!context?.engine || syncing} onClick={() => { void context?.engine?.sync(); }}>
                <RefreshCwIcon className={cn(syncing && 'animate-spin')} />{syncing ? '正在同步…' : '立即同步'}
              </button>
            ) : null}
          </Row>
          {signedIn && guestRecords > 0 && context ? (
            <Row icon={FileInputIcon} title="未登录时的记录" hint={`这个浏览器里还有 ${fmt(guestRecords)} 条登录前的作答记录，可以并入当前账号；账号里已有的答案不会被覆盖。`}>
              <button type="button" className="settings-btn" data-variant="accent" onClick={() => { void importGuestRecords(context).then(setMessage); }}>导入到账号</button>
            </Row>
          ) : null}
          <Row icon={LaptopIcon} title="草稿留在本机" hint="选了选项还没提交、正在输入的填空只保存在当前设备；提交、重做、收藏和注释才会上传。" />
          <Row icon={RefreshCwIcon} title="以最后一次修改为准" hint="同一道题在两台设备上都改过时，保留时间更晚的那一次。" />
        </div>
        {context?.status.error && context.status.phase === 'error' ? <p role="alert" className="text-sm text-destructive">{context.status.error}</p> : null}
        {message ? <p role="status" className="text-sm text-(--home-muted)">{message}</p> : null}
      </PanelSection>
    </div>
  );
}

function LibraryTab() {
  const context = useQuestionDatabase();
  const { tags, cache } = useUserTags();
  const [marks, setMarks] = useState<QuestionMark[] | null>(null);
  const database = context?.database ?? null;
  const namespace = context?.namespace;

  useEffect(() => {
    if (!cache) return;
    let disposed = false;
    const load = () => { void cache.listMarks().then((list) => { if (!disposed) setMarks(list); }).catch(() => { if (!disposed) setMarks([]); }); };
    load();
    const unsubscribe = database?.subscribe((change) => { if (change.namespace === namespace && change.scope === 'annotations') load(); });
    return () => { disposed = true; unsubscribe?.(); };
  }, [cache, database, namespace]);

  const tiles = [
    { icon: StarIcon, label: '收藏', value: marks?.filter((mark) => mark.favorite).length },
    { icon: NotebookPenIcon, label: '注释', value: marks?.filter((mark) => mark.note).length },
    { icon: TagIcon, label: '标签', value: tags.length },
  ];

  return (
    <PanelSection
      title="收藏与标签"
      description="题目右上角的收藏、标签和注释都汇总在收藏夹里，可按标签筛选，点一下回到原题。"
      action={<button type="button" className="settings-btn" data-variant="primary" disabled={!context} onClick={() => context?.openLibrary()}><LibraryBigIcon />打开收藏夹</button>}
    >
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {tiles.map(({ icon: Icon, label, value }) => (
          <div key={label} className="settings-card p-4 sm:p-5">
            <Icon className="size-[18px] text-(--home-muted)" />
            <p className="mt-4 text-[28px] leading-none font-semibold tracking-tight sm:text-[32px]">{fmt(value)}</p>
            <p className="mt-1.5 text-[13px] text-(--home-muted)">{label}</p>
          </div>
        ))}
      </div>
      <div className="settings-card p-5 sm:p-6">
        <p className="text-[15px] font-medium">我的标签</p>
        {tags.length ? (
          <div className="mt-3 flex flex-wrap gap-2">{tags.map((tag) => <UserTagChip key={tag.tagId} tag={tag} />)}</div>
        ) : (
          <p className="mt-1 text-[13px] text-(--home-muted)">还没有标签。在任意题目右上角点标签按钮即可新建，比如「易错」「二刷」。</p>
        )}
      </div>
    </PanelSection>
  );
}

/** A small drawing of the site in one theme, used as the theme choice itself. */
function ThemePreview({ variant }: { variant: 'light' | 'dark' }) {
  const colors = variant === 'light'
    ? { bg: '#ffffff', side: '#f6f6f2', line: '#e5e5e0', ink: '#cfcfc8', strong: '#20201e', accent: '#f5ed91' }
    : { bg: '#0f0f0f', side: '#171716', line: '#2a2a27', ink: '#3a3a36', strong: '#edede7', accent: '#fff19a' };
  return (
    <svg viewBox="0 0 160 100" className="block h-full w-full" aria-hidden>
      <rect width="160" height="100" fill={colors.bg} />
      <rect width="44" height="100" fill={colors.side} />
      <rect x="44" width="1" height="100" fill={colors.line} />
      {[16, 28, 40, 52].map((y, index) => <rect key={y} x="10" y={y} width={index === 0 ? 24 : 20} height="4" rx="2" fill={index === 0 ? colors.strong : colors.ink} />)}
      <rect x="58" y="16" width="56" height="7" rx="3.5" fill={colors.strong} />
      <rect x="58" y="32" width="88" height="4" rx="2" fill={colors.ink} />
      <rect x="58" y="41" width="72" height="4" rx="2" fill={colors.ink} />
      <rect x="58" y="56" width="88" height="30" rx="6" fill={colors.bg} stroke={colors.line} />
      <rect x="66" y="66" width="34" height="4" rx="2" fill={colors.accent} />
      <rect x="66" y="75" width="60" height="4" rx="2" fill={colors.ink} />
    </svg>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser: show the choice after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const current = mounted ? theme ?? 'system' : null;
  const options = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ] as const;
  return (
    <PanelSection title="外观" description="文档、题目、公式和图表都会跟着切换。">
      <div role="radiogroup" aria-label="主题" className="grid grid-cols-3 gap-3 sm:gap-4">
        {options.map(({ value, label }) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className="group text-left"
            >
              <span
                className={cn(
                  'relative block aspect-[16/10] overflow-hidden rounded-2xl border transition-shadow',
                  selected ? 'border-transparent shadow-[0_0_0_2px_var(--home-focus)]' : 'border-(--home-border) group-hover:shadow-(--set-shadow)',
                )}
              >
                {value === 'system' ? (
                  <>
                    <ThemePreview variant="light" />
                    <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]"><ThemePreview variant="dark" /></span>
                  </>
                ) : <ThemePreview variant={value} />}
                {selected ? (
                  <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-(--home-foreground) text-(--home-background)">
                    <CheckIcon className="size-3.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className={cn('mt-2.5 block text-center text-sm', selected ? 'font-medium' : 'text-(--home-muted)')}>{label}</span>
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function DataTab() {
  const context = useQuestionDatabase();
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);
  const host = useSyncExternalStore(noop, () => window.location.host, () => '');
  const [message, setMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(() => {
    const manager = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!manager) { setStorage({}); return; }
    void Promise.all([
      manager.estimate?.().catch(() => undefined),
      manager.persisted?.().catch(() => undefined),
    ]).then(([estimate, persisted]) => setStorage({ usage: estimate?.usage, quota: estimate?.quota, persisted }));
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <div className="space-y-8">
      <PanelSection title="备份" description="把当前身份的答案、提交历史、收藏和注释保存为一个 JSON 文件。">
        <div className="settings-card flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-(--home-accent) text-(--home-accent-foreground)"><DownloadIcon className="size-5" /></span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-[15px] font-medium">导出本机备份</p>
            <p className="mt-0.5 text-[13px] text-(--home-muted)">清理浏览器前，或者没有登录时，建议先导出一份。</p>
          </div>
          <button
            type="button"
            className="settings-btn max-sm:w-full"
            data-variant="primary"
            disabled={!context?.database}
            onClick={() => { if (context) void downloadBackup(context).then(() => setMessage(null), () => setMessage('导出失败，请重试。')); }}
          >
            <DownloadIcon />导出 JSON
          </button>
        </div>
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      </PanelSection>

      <PanelSection title="本机存储" description="答案先写进这个浏览器的本机数据库，登录后再同步到云端。">
        <div className="settings-card">
          <Row
            icon={HardDriveIcon}
            title={storage?.usage !== undefined ? `已用 ${formatBytes(storage.usage)}` : '本机占用'}
            hint={storage === null ? '正在估算…' : storage.usage === undefined ? '这个浏览器不提供存储用量。' : `整个站点的数据（含页面缓存）${storage.quota ? `，浏览器允许的上限约 ${formatBytes(storage.quota)}` : ''}。`}
          />
          <Row
            icon={storage?.persisted ? ShieldCheckIcon : ShieldAlertIcon}
            title={storage?.persisted === undefined ? '持久保存' : storage.persisted ? '持久保存已开启' : '持久保存未开启'}
            hint={storage?.persisted === undefined
              ? '这个浏览器不提供持久保存状态。'
              : storage.persisted
                ? '空间紧张时，浏览器不会自动清理这里的记录。'
                : '空间紧张时浏览器可能清理本机记录。可以申请开启，也建议登录同步或定期导出备份。'}
          >
            {storage?.persisted === false && typeof navigator !== 'undefined' && navigator.storage?.persist ? (
              <button
                type="button"
                className="settings-btn"
                disabled={requesting}
                onClick={() => {
                  setRequesting(true);
                  void navigator.storage.persist().catch(() => false).finally(() => { setRequesting(false); refresh(); });
                }}
              >
                申请开启
              </button>
            ) : null}
          </Row>
          <Row
            icon={GlobeIcon}
            title="按域名保存"
            hint={<>记录保存在当前浏览器的 {host ? <span className="font-medium text-(--home-foreground)">{host}</span> : '这个域名'} 下。清除站点数据、结束隐私模式或换用其他域名，都看不到未同步的本机记录。</>}
          />
        </div>
      </PanelSection>
    </div>
  );
}

function AboutTab() {
  const { tree } = useSourceTree();
  const facts = useMemo(() => {
    if (!tree) return null;
    let questions = 0;
    let pages = 0;
    const walk = (node: (typeof tree.modules)[number]['children'][number]) => {
      if (node.kind === 'page') { if (node.questions) { questions += node.questions; pages++; } return; }
      node.children.forEach(walk);
    };
    tree.modules.forEach((module) => module.children.forEach(walk));
    return { questions, pages, modules: tree.modules.filter((module) => module.questions > 0).length };
  }, [tree]);

  return (
    <PanelSection title="关于">
      <div className="settings-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-(--home-border) bg-(--home-surface) text-lg font-semibold" aria-hidden>考</span>
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-[17px] font-semibold">{siteConfig.name}</p>
            <p className="mt-0.5 text-[13px] text-(--home-muted)">{siteConfig.description}</p>
          </div>
          <a href={siteConfig.repository.url} target="_blank" rel="noreferrer" className="settings-btn">GitHub</a>
        </div>
        <dl className="grid grid-cols-3 border-t border-(--home-border) bg-(--home-surface)">
          {[
            { label: '道可作答的题', value: facts?.questions },
            { label: '个练习页面', value: facts?.pages },
            { label: '个科目模块', value: facts?.modules },
          ].map((item) => (
            <div key={item.label} className="px-5 py-4 sm:px-6 [&+&]:border-l [&+&]:border-(--home-border)">
              <dd className="text-[22px] leading-none font-semibold tracking-tight">{fmt(item.value)}</dd>
              <dt className="mt-1.5 text-[13px] text-(--home-muted)">{item.label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-[13px] text-(--home-muted)">发现题目或解析有误，可以在 GitHub 上提交 Issue，或在页面右上角打开源文件直接修改。</p>
    </PanelSection>
  );
}

/* ------------------------------------------------------------------------- page */

export function SettingsPage() {
  const [tab, setTab] = useTab();
  // Read once for the header and the records tab.
  const records = useQuestionRecords();
  const [signInOpen, setSignInOpen] = useState(false);
  const openSignIn = useCallback(() => setSignInOpen(true), []);

  return (
    <main className="settings mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:pt-10">
      <header className="mb-5 sm:mb-6">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">设置</h1>
        <p className="mt-1 text-sm text-(--home-muted)">做过的题、来自哪里，以及账号、同步和本机数据。</p>
      </header>

      <Hero state={records} onSignIn={openSignIn} />

      <div className="sticky top-16 z-20 mt-6 sm:mt-8">
        <div className="settings-tabs w-fit max-w-full shadow-[0_8px_24px_-16px_rgb(0_0_0/0.3)]" role="tablist" aria-label="设置分区">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (!step) return;
                event.preventDefault();
                const next = TABS[(TABS.findIndex((item) => item.id === tab) + step + TABS.length) % TABS.length].id;
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
              className="settings-tab"
            >
              <Icon />{label}
            </button>
          ))}
        </div>
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6 sm:mt-8">
        {tab === 'records' ? <RecordsTab state={records} /> : null}
        {tab === 'account' ? <AccountTab onSignIn={openSignIn} /> : null}
        {tab === 'library' ? <LibraryTab /> : null}
        {tab === 'appearance' ? <AppearanceTab /> : null}
        {tab === 'data' ? <DataTab /> : null}
        {tab === 'about' ? <AboutTab /> : null}
      </div>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </main>
  );
}
