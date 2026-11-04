'use client';

import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DownloadIcon, LibraryBigIcon, LogInIcon, LogOutIcon, RefreshCwIcon } from 'lucide-react';
import { SignInDialog, useAccount } from '@/components/account';
import { describeSync, downloadBackup, importGuestRecords } from '@/components/question/account-section';
import { useQuestionDatabase } from '@/components/question/database-context';
import { UserTagChip } from '@/components/question/marks/question-marks';
import { useUserTags } from '@/components/question/marks/use-marks';
import { useQuestionRecords, type QuestionRecordsState } from '@/components/question/use-question-records';
import { accountLabel } from '@/lib/account/types';
import { useSourceTree } from '@/lib/doc-sources-client';
import type { QuestionMark } from '@/lib/question-store/types';
import { siteConfig } from '@/lib/site-config';
import sheet from '@/styles/answer-sheet.module.css';
import clsx from 'clsx';
import { CandidateSheet } from './candidate-sheet';
import { RecordsPanel } from './records-panel';
import styles from './settings.module.css';

/*
 * Everything about the reader rather than the documents, in the home page's
 * answer-sheet language. The candidate block (who, sync state, totals, the
 * answered count as an admission number, a year of practice) sits above the
 * sections: records by source, account and sync, favourites and tags,
 * appearance, local data, and the site. The section follows the URL hash, so
 * /settings#account opens it and Back returns to the previous one.
 */

const TABS = [
  { id: 'records', label: '学习记录' },
  { id: 'account', label: '账号与同步' },
  { id: 'library', label: '收藏与标签' },
  { id: 'appearance', label: '外观' },
  { id: 'data', label: '数据与存储' },
  { id: 'about', label: '关于' },
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
    // No element carries a section's id, so changing the hash never scrolls.
    window.location.hash = next;
  }, []);
  return [tab, select];
}

/* --------------------------------------------------------------- building blocks */

function PanelHead({ title, note, action }: { title: string; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.panelHead}>
      <div>
        <h2 className={styles.panelTitle}>{title}</h2>
        {note ? <p className={styles.panelNote}>{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** One line of a form: a label, what it says now and what can be done about it. */
function Field({ label, children, hint, action }: { label: string; children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>
        {children}
        {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
      </dd>
      {action ? <dd className={styles.fieldAction}>{action}</dd> : null}
    </div>
  );
}

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

/* ----------------------------------------------------------------------- panels */

function RecordsTab({ state }: { state: QuestionRecordsState }) {
  const { tree, index, failed } = useSourceTree();
  return (
    <>
      <PanelHead
        title="学习记录"
        note="每道题都按它所在的页面归到侧边栏的模块和目录下；页面改名或调整目录后，旧记录也会显示新的位置。"
      />
      <RecordsPanel records={state.records} error={state.error} tree={tree} index={index} treeFailed={failed} />
    </>
  );
}

function AccountTab({ onSignIn }: { onSignIn(): void }) {
  const account = useAccount();
  const context = useQuestionDatabase();
  const guestRecords = useGuestRecordCount();
  const [message, setMessage] = useState<string | null>(null);
  const user = account.phase === 'signed-in' ? account.user : null;
  const sync = describeSync(context);
  const syncing = context?.status.phase === 'syncing';

  return (
    <div className={styles.stack}>
      <div>
        <PanelHead title="账号与同步" note="登录后，提交、重做、收藏和注释会同步到云端，换设备也能接着做。" />
        <dl className={styles.fields}>
          <Field
            label="账号"
            hint={user
              ? '用邮箱登录的账号。'
              : account.phase === 'disabled'
                ? '这个站点没有启用云端账号，记录只保存在本机。'
                : account.phase === 'loading' ? '正在读取登录状态…' : '用邮箱登录，不需要密码。'}
            action={user ? (
              <button type="button" className={styles.button} onClick={() => { void account.signOut().catch(() => undefined); }}>
                <LogOutIcon aria-hidden />退出登录
              </button>
            ) : account.phase === 'disabled' ? undefined : (
              <button type="button" className={clsx(styles.button, styles.primary)} disabled={account.phase !== 'guest'} onClick={onSignIn}>
                <LogInIcon aria-hidden />登录 / 注册
              </button>
            )}
          >
            {user ? accountLabel(user) : '未登录'}
          </Field>
          <Field
            label="同步"
            action={user ? (
              <button type="button" className={styles.button} disabled={!context?.engine || syncing} onClick={() => { void context?.engine?.sync(); }}>
                <RefreshCwIcon aria-hidden className={clsx(syncing && 'animate-spin')} />{syncing ? '正在同步…' : '立即同步'}
              </button>
            ) : undefined}
          >
            {user && sync
              ? <span className={styles.state} data-tone={sync.tone} role="status">{sync.text}</span>
              : <span className={styles.state} data-tone="muted">登录后开启云端同步</span>}
          </Field>
          {user && guestRecords > 0 && context ? (
            <Field
              label="登录前的记录"
              hint="可以并入当前账号；账号里已有的答案不会被覆盖。"
              action={(
                <button type="button" className={clsx(styles.button, styles.primary)} onClick={() => { void importGuestRecords(context).then(setMessage); }}>
                  导入到账号
                </button>
              )}
            >
              这个浏览器里还有 {fmt(guestRecords)} 条未登录时的作答记录
            </Field>
          ) : null}
        </dl>
        {context?.status.error && context.status.phase === 'error' ? <p role="alert" className={styles.error}>{context.status.error}</p> : null}
        {message ? <p role="status" className={styles.message}>{message}</p> : null}
      </div>

      <section className={styles.notice} aria-labelledby="sync-notice">
        <h3 id="sync-notice">同步须知</h3>
        <ul>
          <li><strong>草稿留在本机</strong>选了选项还没提交、正在输入的填空只保存在当前设备；提交、重做、收藏和注释才会上传。</li>
          <li><strong>以最后一次修改为准</strong>同一道题在两台设备上都改过时，保留时间更晚的那一次。</li>
          <li><strong>退出后记录仍在</strong>本机记录留在这个浏览器里，再次登录同一账号即可继续同步。</li>
        </ul>
      </section>
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

  return (
    <div className={styles.stack}>
      <div>
        <PanelHead
          title="收藏与标签"
          note="题目右上角的收藏、标签和注释都汇总在收藏夹里，可按标签筛选，点一下回到原题。"
          action={(
            <button type="button" className={clsx(styles.button, styles.primary)} disabled={!context} onClick={() => context?.openLibrary()}>
              <LibraryBigIcon aria-hidden />打开收藏夹
            </button>
          )}
        />
        <dl className={styles.tally}>
          <div><dt>收藏的题</dt><dd>{fmt(marks?.filter((mark) => mark.favorite).length)}</dd></div>
          <div><dt>写了注释的题</dt><dd>{fmt(marks?.filter((mark) => mark.note).length)}</dd></div>
          <div><dt>标签</dt><dd>{fmt(tags.length)}</dd></div>
        </dl>
      </div>
      <section aria-labelledby="my-tags">
        <h3 id="my-tags" className={styles.subhead}>我的标签</h3>
        {tags.length ? (
          <div className={styles.tags}>{tags.map((tag) => <UserTagChip key={tag.tagId} tag={tag} />)}</div>
        ) : (
          <p className={styles.empty}>还没有标签。在任意题目右上角点标签按钮即可新建，比如「易错」「二刷」。</p>
        )}
      </section>
    </div>
  );
}

/** A small drawing of the home page in one theme, used as the theme choice itself. */
function ThemePreview({ variant }: { variant: 'light' | 'dark' }) {
  const c = variant === 'light'
    ? { paper: '#ffffff', rule: '#e4e5e9', ink: '#1c1d21', soft: '#c9cacf', red: '#c8324f', line: '#efb4c0' }
    : { paper: '#0a0a0a', rule: '#2a2b31', ink: '#ececef', soft: '#45464d', red: '#ff7d93', line: '#6b3542' };
  return (
    <svg className={styles.shot} viewBox="0 0 160 100" aria-hidden>
      <rect width="160" height="100" fill={c.paper} />
      <rect x="10" y="5" width="18" height="3" rx="1" fill={c.ink} />
      <rect x="126" y="4.5" width="24" height="4" rx="2" fill={c.rule} />
      <rect y="13" width="160" height="0.75" fill={c.rule} />
      <rect x="12" y="27" width="50" height="7" rx="1" fill={c.ink} />
      <rect x="12" y="38" width="40" height="7" rx="1" fill={c.ink} />
      <rect x="12" y="52" width="54" height="2.5" rx="1" fill={c.soft} />
      <rect x="12" y="58" width="46" height="2.5" rx="1" fill={c.soft} />
      <rect x="12" y="68" width="20" height="7" rx="1.5" fill={c.ink} />
      <rect x="35" y="68" width="18" height="7" rx="1.5" fill="none" stroke={c.ink} strokeWidth="0.8" />
      <rect x="82" y="22" width="66" height="64" rx="2" fill={c.paper} stroke={c.red} strokeWidth="0.9" />
      {[30, 37, 44, 51, 58, 65, 72].map((y) => <rect key={y} x="86" y={y} width="3" height="1.6" fill={c.ink} />)}
      <rect x="95" y="27" width="18" height="4" fill={c.red} />
      <rect x="95" y="37" width="44" height="2.5" rx="1" fill={c.soft} />
      <rect x="95" y="43" width="36" height="2.5" rx="1" fill={c.soft} />
      <rect x="95" y="49" width="40" height="2.5" rx="1" fill={c.soft} />
      <rect x="95" y="58" width="48" height="0.6" fill={c.line} />
      {[95, 107, 119, 131].map((x, index) => (
        <rect key={x} x={x} y="65" width="9" height="5" rx="0.6" fill={index === 1 ? c.ink : 'none'} stroke={index === 1 ? c.ink : c.line} strokeWidth="0.7" />
      ))}
    </svg>
  );
}

function PenTick() {
  return (
    <svg className={styles.tick} viewBox="0 0 48 40" aria-hidden>
      <path pathLength={1} d="M6 22 C10 25 14 29 18 34 C24 22 32 12 44 4" />
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
    <>
      <PanelHead title="外观" note="文档、题目、公式和图表都会跟着切换。" />
      <div role="radiogroup" aria-label="主题" className={styles.themes}>
        {options.map(({ value, label }) => {
          const selected = current === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => setTheme(value)} className={styles.theme}>
              <span className={styles.preview}>
                <ThemePreview variant={value === 'dark' ? 'dark' : 'light'} />
                {value === 'system' ? <span className={styles.half}><ThemePreview variant="dark" /></span> : null}
                {selected ? <PenTick /> : null}
              </span>
              <span className={styles.themeLabel}><span className={styles.mark} aria-hidden />{label}</span>
            </button>
          );
        })}
      </div>
    </>
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

  const canPersist = storage?.persisted === false && typeof navigator !== 'undefined' && Boolean(navigator.storage?.persist);

  return (
    <>
      <PanelHead title="数据与存储" note="答案先写进这个浏览器的本机数据库，登录后再同步到云端。" />
      <dl className={styles.fields}>
        <Field
          label="备份"
          hint="当前身份的答案、提交历史、收藏和注释，保存为一个 JSON 文件。清理浏览器前，或者没有登录时，建议先导出一份。"
          action={(
            <button
              type="button"
              className={clsx(styles.button, styles.primary)}
              disabled={!context?.database}
              onClick={() => { if (context) void downloadBackup(context).then(() => setMessage(null), () => setMessage('导出失败，请重试。')); }}
            >
              <DownloadIcon aria-hidden />导出 JSON
            </button>
          )}
        >
          导出本机备份
        </Field>
        <Field
          label="本机占用"
          hint={storage === null
            ? '正在估算…'
            : storage.usage === undefined
              ? '这个浏览器不提供存储用量。'
              : `整个站点的数据，含页面缓存${storage.quota ? `；浏览器允许的上限约 ${formatBytes(storage.quota)}` : ''}。`}
        >
          {storage?.usage !== undefined ? `已用 ${formatBytes(storage.usage)}` : '–'}
          {storage?.usage !== undefined && storage.quota ? (
            <span className={styles.meter} aria-hidden><span style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%` }} /></span>
          ) : null}
        </Field>
        <Field
          label="持久保存"
          hint={storage?.persisted === undefined
            ? '这个浏览器不提供持久保存状态。'
            : storage.persisted
              ? '空间紧张时，浏览器不会自动清理这里的记录。'
              : '空间紧张时浏览器可能清理本机记录。可以申请开启，也建议登录同步或定期导出备份。'}
          action={canPersist ? (
            <button
              type="button"
              className={styles.button}
              disabled={requesting}
              onClick={() => {
                setRequesting(true);
                void navigator.storage.persist().catch(() => false).finally(() => { setRequesting(false); refresh(); });
              }}
            >
              申请开启
            </button>
          ) : undefined}
        >
          <span className={styles.state} data-tone={storage?.persisted ? 'ok' : storage?.persisted === false ? 'warn' : 'muted'}>
            {storage?.persisted === undefined ? '未知' : storage.persisted ? '已开启' : '未开启'}
          </span>
        </Field>
        <Field
          label="保存位置"
          hint="清除站点数据、结束隐私模式或换用其他域名，都看不到未同步的本机记录。"
        >
          {host ? <>当前浏览器的 <strong>{host}</strong> 下</> : '当前浏览器的这个域名下'}
        </Field>
      </dl>
      {message ? <p role="alert" className={styles.error}>{message}</p> : null}
    </>
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
    <>
      <PanelHead title="关于" />
      <div className={styles.site}>
        <div>
          <p className={styles.siteName}>{siteConfig.name}</p>
          <p className={styles.siteText}>{siteConfig.description}发现题目或解析有误，可以在 GitHub 上提交 Issue，或在页面右上角打开源文件直接修改。</p>
          <p className={styles.siteLinks}>
            <a href={siteConfig.repository.url} target="_blank" rel="noreferrer">GitHub 仓库</a>
            <a href="/docs/question-types/">题型示例</a>
            <a href="/llms.txt">全部文档目录</a>
          </p>
        </div>
        <svg className={styles.seal} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <path id="about-seal-arc" d="M 18 52 A 32 32 0 1 1 82 52" />
          </defs>
          <circle cx="50" cy="50" r="45" />
          <text fontSize="12" letterSpacing="1">
            <textPath href="#about-seal-arc" startOffset="50%" textAnchor="middle">考研学习复习专用</textPath>
          </text>
          <text x="50" y="62" fontSize="26" textAnchor="middle">★</text>
        </svg>
      </div>
      <dl className={styles.tally}>
        <div><dt>道可作答的题</dt><dd>{fmt(facts?.questions)}</dd></div>
        <div><dt>个练习页面</dt><dd>{fmt(facts?.pages)}</dd></div>
        <div><dt>个科目模块</dt><dd>{fmt(facts?.modules)}</dd></div>
      </dl>
    </>
  );
}

/* ------------------------------------------------------------------------- page */

export function SettingsPage() {
  const [tab, setTab] = useTab();
  // Read once for the candidate block and the records section.
  const records = useQuestionRecords();
  const [signInOpen, setSignInOpen] = useState(false);
  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const panel = useRef<HTMLDivElement>(null);

  const select = (next: TabId, focus = false) => {
    setTab(next);
    if (focus) document.getElementById(`tab-${next}`)?.focus();
    // Switching from far down a long section starts the new one at its top.
    const node = panel.current;
    if (node && node.getBoundingClientRect().top < parseFloat(getComputedStyle(node).scrollMarginTop)) node.scrollIntoView({ block: 'start' });
  };

  return (
    <div className={clsx(sheet.palette, styles.page)}>
      <header className={styles.head}>
        <h1 className={styles.title}>设置</h1>
        <p className={styles.note}>做过的题、来自哪里，以及账号、同步和本机数据。</p>
      </header>

      <CandidateSheet state={records} onSignIn={openSignIn} />

      <div className={styles.layout}>
        <div className={styles.nav} role="tablist" aria-label="设置分区">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => select(id)}
              onKeyDown={(event) => {
                const position = TABS.findIndex((item) => item.id === tab);
                const target = event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? TABS.length - 1
                    : ['ArrowRight', 'ArrowDown'].includes(event.key)
                      ? (position + 1) % TABS.length
                      : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (position - 1 + TABS.length) % TABS.length : null;
                if (target === null) return;
                event.preventDefault();
                select(TABS[target].id, true);
              }}
              className={styles.tab}
            >
              <span className={styles.mark} aria-hidden />{label}
            </button>
          ))}
        </div>

        <div ref={panel} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panel}>
          {tab === 'records' ? <RecordsTab state={records} /> : null}
          {tab === 'account' ? <AccountTab onSignIn={openSignIn} /> : null}
          {tab === 'library' ? <LibraryTab /> : null}
          {tab === 'appearance' ? <AppearanceTab /> : null}
          {tab === 'data' ? <DataTab /> : null}
          {tab === 'about' ? <AboutTab /> : null}
        </div>
      </div>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
