'use client';

import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DownloadIcon, FileInputIcon, LibraryBigIcon, LogInIcon, LogOutIcon, MonitorIcon, MoonIcon, RefreshCwIcon, SunIcon } from 'lucide-react';
import { SignInDialog, useAccount } from '@/components/account';
import { describeSync, downloadBackup, importGuestRecords } from '@/components/question/account-section';
import { useQuestionDatabase } from '@/components/question/database-context';
import { useUserTags } from '@/components/question/marks/use-marks';
import { useQuestionRecords } from '@/components/question/use-question-records';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { accountInitials, accountLabel } from '@/lib/account/types';
import { useSourceTree } from '@/lib/doc-sources-client';
import type { QuestionMark } from '@/lib/question-store/types';
import { siteConfig } from '@/lib/site-config';
import { cn } from '@/lib/utils';
import { RecordsPanel } from './records-panel';

/*
 * One page for everything about the reader rather than the documents:
 * account and sync, the answer records by source, favourites and tags,
 * appearance, the data kept in this browser, and the site itself.
 */

const SECTIONS = [
  { id: 'records', label: '答题记录' },
  { id: 'account', label: '账号与同步' },
  { id: 'library', label: '收藏与标签' },
  { id: 'appearance', label: '外观' },
  { id: 'data', label: '数据与存储' },
  { id: 'about', label: '关于' },
] as const;

const numberFormat = new Intl.NumberFormat('zh-CN');

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-(--home-border) pt-8 pb-10 first:border-t-0 first:pt-0">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-(--home-muted)">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A labelled row of a settings list: what it is on the left, its value or action on the right. */
function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-(--home-border) py-4 first:border-t-0">
      <div className="min-w-0 flex-1 basis-60">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="mt-0.5 text-sm leading-relaxed text-(--home-muted)">{hint}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-(--home-radius) border border-(--home-border) bg-(--home-elevated) px-5 sm:px-6">{children}</div>;
}

const DOT = {
  ok: 'bg-emerald-500', busy: 'bg-sky-500 animate-pulse', muted: 'bg-(--home-muted)', warn: 'bg-amber-500', error: 'bg-destructive',
} as const;

function AccountSection() {
  const account = useAccount();
  const context = useQuestionDatabase();
  const [signInOpen, setSignInOpen] = useState(false);
  const [guestRecords, setGuestRecords] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const signedIn = account.phase === 'signed-in' ? account.user : null;
  const sync = describeSync(context);
  const database = context?.database ?? null;
  const namespace = context?.namespace ?? 'guest';
  const syncing = context?.status.phase === 'syncing';

  useEffect(() => {
    if (!database || namespace === 'guest') return;
    let disposed = false;
    const refresh = () => {
      void database.answers.summary('guest').then((guest) => { if (!disposed) setGuestRecords(guest.answered + guest.attempts); }).catch(() => undefined);
    };
    refresh();
    const unsubscribe = database.subscribe((change) => { if (change.namespace === 'guest') refresh(); });
    return () => { disposed = true; unsubscribe(); };
  }, [database, namespace]);

  return (
    <Section id="account" title="账号与同步" description="登录后，提交、重做、收藏和注释会同步到云端，换设备也能接着做；草稿只留在当前设备。">
      <Panel>
        <Row
          label={
            <span className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarFallback className={signedIn ? 'bg-primary/10 font-medium text-primary' : undefined}>{signedIn ? accountInitials(signedIn) : '?'}</AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate">{signedIn ? accountLabel(signedIn) : '未登录'}</span>
                <span className="block text-sm font-normal text-(--home-muted)">
                  {signedIn ? '邮箱账号' : account.phase === 'disabled' ? '这个站点未启用云端账号，记录只保存在本机' : account.phase === 'loading' ? '正在读取登录状态…' : '记录目前只保存在这个浏览器'}
                </span>
              </span>
            </span>
          }
        >
          {signedIn ? (
            <Button variant="outline" onClick={() => { void account.signOut().catch(() => undefined); }}><LogOutIcon />退出登录</Button>
          ) : (
            <Button disabled={account.phase !== 'guest'} onClick={() => setSignInOpen(true)}><LogInIcon />登录 / 注册</Button>
          )}
        </Row>
        {signedIn ? (
          <Row
            label="同步状态"
            hint={sync ? (
              <span className="inline-flex items-center gap-1.5" role="status">
                <span aria-hidden className={cn('size-1.5 rounded-full', DOT[sync.tone])} />{sync.text}
              </span>
            ) : '—'}
          >
            <Button variant="outline" disabled={!context?.engine || syncing} onClick={() => { void context?.engine?.sync(); }}>
              <RefreshCwIcon className={cn(syncing && 'animate-spin')} />{syncing ? '正在同步…' : '立即同步'}
            </Button>
          </Row>
        ) : null}
        {signedIn && guestRecords > 0 && context ? (
          <Row label="未登录时的记录" hint={`这个浏览器里还有 ${numberFormat.format(guestRecords)} 条登录前的作答记录，可以并入当前账号；账号里已有的答案不会被覆盖。`}>
            <Button variant="outline" onClick={() => { void importGuestRecords(context).then(setMessage); }}><FileInputIcon />导入</Button>
          </Row>
        ) : null}
        {signedIn ? <Row label="退出后" hint="本机记录保留在这个浏览器；再次登录同一账号即可继续同步。" /> : null}
        {context?.status.error && context.status.phase === 'error' ? <p role="alert" className="pb-4 text-sm text-destructive">{context.status.error}</p> : null}
        {message ? <p role="status" className="pb-4 text-sm text-(--home-muted)">{message}</p> : null}
      </Panel>
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </Section>
  );
}

function LibrarySection() {
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

  const counts = useMemo(() => ({
    favorite: marks?.filter((mark) => mark.favorite).length,
    note: marks?.filter((mark) => mark.note).length,
  }), [marks]);
  const value = (count: number | undefined) => (count === undefined ? '–' : numberFormat.format(count));

  return (
    <Section id="library" title="收藏与标签" description="在题目右上角收藏、打标签或写注释，都会汇总到收藏夹，可按标签筛选。">
      <Panel>
        <Row
          label={
            <span className="flex flex-wrap gap-x-6 gap-y-1 font-normal">
              <span><span className="text-lg font-semibold tabular-nums">{value(counts.favorite)}</span> <span className="text-sm text-(--home-muted)">收藏</span></span>
              <span><span className="text-lg font-semibold tabular-nums">{value(counts.note)}</span> <span className="text-sm text-(--home-muted)">注释</span></span>
              <span><span className="text-lg font-semibold tabular-nums">{numberFormat.format(tags.length)}</span> <span className="text-sm text-(--home-muted)">标签</span></span>
            </span>
          }
        >
          <Button variant="outline" disabled={!context} onClick={() => context?.openLibrary()}><LibraryBigIcon />打开收藏夹</Button>
        </Row>
      </Panel>
    </Section>
  );
}

const noop = () => () => {};

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  // The theme is only known in the browser: render the choice after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const options = [
    { value: 'light', label: '浅色', icon: SunIcon },
    { value: 'dark', label: '深色', icon: MoonIcon },
    { value: 'system', label: '跟随系统', icon: MonitorIcon },
  ] as const;
  return (
    <Section id="appearance" title="外观">
      <Panel>
        <Row label="主题" hint="文档、题目和公式都会跟着切换。">
          <div role="radiogroup" aria-label="主题" className="inline-flex rounded-full border border-(--home-border) p-0.5">
            {options.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mounted && (theme ?? 'system') === value}
                onClick={() => setTheme(value)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-(--home-muted) aria-checked:bg-(--home-foreground) aria-checked:text-(--home-background)"
              >
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>
        </Row>
      </Panel>
    </Section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function DataSection() {
  const context = useQuestionDatabase();
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);
  const [host, setHost] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setHost(window.location.host);
    const manager = navigator.storage;
    if (!manager) { setStorage({}); return; }
    void Promise.all([
      manager.estimate?.().catch(() => undefined),
      manager.persisted?.().catch(() => undefined),
    ]).then(([estimate, persisted]) => setStorage({ usage: estimate?.usage, quota: estimate?.quota, persisted }));
  }, []);

  return (
    <Section id="data" title="数据与存储" description="答案先写进这个浏览器的本机数据库，登录后再同步到云端。">
      <Panel>
        <Row label="导出本机备份" hint="把当前身份的答案、提交历史、收藏和注释保存为 JSON 文件。">
          <Button
            variant="outline"
            disabled={!context?.database}
            onClick={() => { if (context) void downloadBackup(context).then(() => setMessage(null), () => setMessage('导出失败，请重试。')); }}
          >
            <DownloadIcon />导出
          </Button>
        </Row>
        <Row
          label="本机占用"
          hint={storage === null ? '正在估算…' : storage.usage === undefined ? '这个浏览器不提供存储用量。' : `已用 ${formatBytes(storage.usage)}${storage.quota ? `，可用上限约 ${formatBytes(storage.quota)}` : ''}（整个站点，含页面缓存）`}
        />
        <Row
          label="持久保存"
          hint={storage?.persisted === undefined
            ? '这个浏览器不提供持久保存状态。'
            : storage.persisted
              ? '已开启：存储空间紧张时浏览器不会自动清理这里的记录。'
              : '未开启：存储空间紧张时浏览器可能清理本机记录，建议登录同步或定期导出备份。'}
        />
        <Row
          label="保存位置"
          hint={<>记录按域名保存在当前浏览器{host ? <>（<span className="text-(--home-foreground)">{host}</span>）</> : null}。清除站点数据、结束隐私模式或换用其他域名，都看不到未同步的本机记录。</>}
        />
        {message ? <p role="alert" className="pb-4 text-sm text-destructive">{message}</p> : null}
      </Panel>
    </Section>
  );
}

function AboutSection({ questions, pages }: { questions: number | null; pages: number | null }) {
  return (
    <Section id="about" title="关于">
      <Panel>
        <Row label={siteConfig.name} hint={siteConfig.description} />
        <Row
          label="题库规模"
          hint={questions === null ? '正在统计…' : `共 ${numberFormat.format(questions)} 道可作答的题，分布在 ${numberFormat.format(pages ?? 0)} 个页面。`}
        />
        <Row label="源代码与反馈" hint="文档和组件都在 GitHub 上维护，发现题目错误可以直接提交 Issue。">
          <a href={siteConfig.repository.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })}>GitHub</a>
        </Row>
      </Panel>
    </Section>
  );
}

function SectionNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    const targets = SECTIONS.map((section) => document.getElementById(section.id)).filter((node): node is HTMLElement => node !== null);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-20% 0px -70% 0px' });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return (
    <nav aria-label="设置分区" className="sticky top-(--fd-nav-height,3.5rem) z-10 -mx-4 bg-(--home-background)/90 px-4 py-2 backdrop-blur lg:top-24 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {SECTIONS.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'location' : undefined}
              onClick={() => setActive(section.id)}
              className="block rounded-lg px-3 py-1.5 text-sm text-(--home-muted) hover:text-(--home-foreground) aria-[current=location]:bg-(--home-active) aria-[current=location]:text-(--home-foreground)"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SettingsPage() {
  const { records, error } = useQuestionRecords();
  const { tree, index, failed } = useSourceTree();
  const context = useQuestionDatabase();
  const library = useMemo(() => {
    if (!tree) return { questions: null, pages: null };
    let questions = 0;
    let pages = 0;
    for (const module of tree.modules) {
      const walk = (node: (typeof module.children)[number]) => {
        if (node.kind === 'page') { if (node.questions) { questions += node.questions; pages++; } return; }
        node.children.forEach(walk);
      };
      module.children.forEach(walk);
    }
    return { questions, pages };
  }, [tree]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-24 sm:px-6 lg:pt-12">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">设置</h1>
        <p className="mt-2 text-(--home-muted)">做过哪些题、来自哪个模块和目录，以及账号、同步和本机数据。</p>
      </header>
      <div className="mt-6 grid gap-x-12 lg:mt-10 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <SectionNav />
        <div className="min-w-0 pt-6 lg:pt-0">
          <Section
            id="records"
            title="答题记录"
            description={<>每条记录都按题目所在页面归到侧边栏的模块和目录下；页面改名或调整目录后，旧记录会跟着显示新的位置。{context?.user ? '这里显示当前账号在本机和云端同步下来的记录。' : '这里显示这个浏览器里的记录。'}</>}
          >
            {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
            <RecordsPanel records={records} tree={tree} index={index} treeFailed={failed} />
          </Section>
          <AccountSection />
          <LibrarySection />
          <AppearanceSection />
          <DataSection />
          <AboutSection questions={library.questions} pages={library.pages} />
        </div>
      </div>
    </main>
  );
}
