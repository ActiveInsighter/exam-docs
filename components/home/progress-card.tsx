'use client';

import { ArrowRight } from 'lucide-react';
import { useMemo, useSyncExternalStore } from 'react';
import { IntentLink as Link } from '@/components/intent-link';
import { useQuestionRecords } from '@/components/question/use-question-records';
import { resolveSource, sourceTrail } from '@/lib/doc-sources';
import { useSourceTree } from '@/lib/doc-sources-client';
import { dayKey, totalsOf } from '@/lib/question-records';
import styles from './progress-card.module.css';

/*
 * The reader's own progress, read from the answer records every question page
 * already keeps in the browser (and syncs after sign-in). Shows where they
 * stopped, a few totals and the last weeks of practice as answer-sheet boxes.
 * Before any answer it explains how the card fills up.
 */

const WEEKS = 20;
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const numberFormat = new Intl.NumberFormat('zh-CN');
const noop = () => () => {};

/** How a first-time reader gets from here to a filled card, in order. */
const FIRST_STEPS = [
  { title: '作答', text: '单选、判断选完即判分；多选和填空点「提交答案」。' },
  { title: '看解答', text: '判分后点「查看解答」，对照思路找到错在哪一步。' },
  { title: '做标记', text: '每道题右上角可以收藏、打标签、写笔记，之后集中复习。' },
  { title: '登录同步', text: '记录先存在这台设备，登录后在手机和电脑间同步。' },
] as const;

interface Day {
  key: string;
  label: string;
  count: number;
  level: number;
  today: boolean;
  future: boolean;
}

function buildDays(activity: ReadonlyMap<string, number>, now: Date): Day[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  const days: Day[] = [];
  let max = 0;
  for (let index = 0; index < WEEKS * 7; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dayKey(date);
    const count = activity.get(key) ?? 0;
    max = Math.max(max, count);
    days.push({
      key,
      label: `${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAYS[(date.getDay() + 6) % 7]}：${count ? `做了 ${count} 道题` : '没有做题'}`,
      count,
      level: 0,
      today: date.getTime() === today.getTime(),
      future: date > today,
    });
  }
  const top = Math.max(max, 4);
  for (const day of days) day.level = day.count ? Math.min(4, Math.max(1, Math.ceil((day.count / top) * 4))) : 0;
  return days;
}

function relativeTime(iso: string, now: Date): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.floor((startOfToday - new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime()) / 86400000);
  const clock = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
  if (days <= 0) return `今天 ${clock}`;
  if (days === 1) return `昨天 ${clock}`;
  if (days < 30) return `${days} 天前`;
  return `${time.getFullYear()} 年 ${time.getMonth() + 1} 月 ${time.getDate()} 日`;
}

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

export function ProgressCard({ startHref }: { startHref: string }) {
  const { records, activity } = useQuestionRecords();
  const hasRecords = Boolean(records?.length);
  const { index } = useSourceTree(hasRecords);
  // "Today" is unknown to the static page: render empty boxes first, real dates after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const now = useMemo(() => (mounted ? new Date() : null), [mounted]);
  const days = useMemo(() => (now ? buildDays(activity ?? new Map(), now) : null), [activity, now]);
  const totals = useMemo(() => (records ? totalsOf(records) : null), [records]);
  const latest = records?.[0];
  const latestSource = latest ? resolveSource(index, latest.documentPath) : null;

  return (
    <section className={styles.card} aria-labelledby="progress-title" aria-busy={records === null}>
      <header className={styles.head}>
        <h2 id="progress-title" className={styles.title}>
          我的进度
        </h2>
        {hasRecords && (
          <Link href="/settings/" className={styles.more}>
            全部记录
          </Link>
        )}
      </header>

      {records === null ? (
        <p className={styles.empty}>正在读取这台设备上的作答记录…</p>
      ) : !hasRecords || !totals || !latest || !latestSource ? (
        <div className={styles.emptyBlock}>
          <p className={styles.empty}>还没有作答记录。做过的题会出现在这里：上次做到的位置、做题总数和做题日历。</p>
          <ol className={styles.steps}>
            {FIRST_STEPS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <Link href={startHref} className={styles.resume}>
            从第一套题开始
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <Link href={withSlash(latestSource.url)} className={styles.last}>
            <span className={styles.lastLabel}>上次做到 {now ? relativeTime(latest.lastAt, now) : ''}</span>
            <strong>{latestSource.page}</strong>
            <span className={styles.trail}>{sourceTrail(latestSource)}</span>
            <span className={styles.resume}>
              继续做题
              <ArrowRight aria-hidden="true" />
            </span>
          </Link>
          <dl className={styles.totals}>
            <div>
              <dt>作答</dt>
              <dd>{numberFormat.format(totals.answered)}</dd>
            </div>
            <div>
              <dt>判分</dt>
              <dd>{numberFormat.format(totals.attempts)}</dd>
            </div>
            <div>
              <dt>涉及页面</dt>
              <dd>{numberFormat.format(totals.pages)}</dd>
            </div>
          </dl>
        </>
      )}

      <figure className={styles.calendar}>
        <div className={styles.days} role="img" aria-label={`最近 ${WEEKS} 周的做题日历`}>
          {(days ?? Array.from({ length: WEEKS * 7 }, () => null)).map((day, position) => (
            <i
              key={day?.key ?? position}
              className={styles.day}
              data-level={day?.level || undefined}
              data-today={day?.today ? '' : undefined}
              data-future={day?.future ? '' : undefined}
              title={day && !day.future ? day.label : undefined}
            />
          ))}
        </div>
        <figcaption className={styles.caption}>
          <span>最近 {WEEKS} 周</span>
          <span className={styles.scale} aria-hidden="true">
            少<i data-level="1" />
            <i data-level="2" />
            <i data-level="3" />
            <i data-level="4" />多
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
