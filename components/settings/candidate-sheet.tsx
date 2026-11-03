'use client';

import { LogInIcon } from 'lucide-react';
import { useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { useAccount } from '@/components/account';
import { describeSync } from '@/components/question/account-section';
import { useQuestionDatabase } from '@/components/question/database-context';
import type { QuestionRecordsState } from '@/components/question/use-question-records';
import { accountLabel } from '@/lib/account/types';
import { streakOf, totalsOf } from '@/lib/question-records';
import clsx from 'clsx';
import { ActivityCalendar } from './activity-calendar';
import styles from './candidate-sheet.module.css';
import page from './settings.module.css';

/*
 * The overview at the top of the settings page, printed like the candidate
 * block of an answer sheet: the reader's name and totals as written fields,
 * the answered count filled into an admission-number grid, the account as
 * the barcode sticker, and a year of practice as a strip of boxes.
 */

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const MIN_COLUMNS = 5;
const numberFormat = new Intl.NumberFormat('zh-CN');
const fmt = (value: number | null | undefined) => (value === null || value === undefined ? '–' : numberFormat.format(value));
const noop = () => () => {};

/** The answered count, one digit per column, filled in the way an admission number is. */
function NumberGrid({ value }: { value: number | null }) {
  const text = value === null ? '' : String(value);
  const width = Math.max(MIN_COLUMNS, text.length);
  const digits = value === null ? null : text.padStart(width, '0');
  const lead = width - text.length;
  return (
    <figure className={styles.number}>
      <figcaption className={styles.numberLabel}>已作答题数</figcaption>
      <div className={styles.columns} role="img" aria-label={value === null ? '已作答题数：正在读取' : `已作答 ${value} 道题`}>
        {Array.from({ length: width }, (_, column) => {
          const digit = digits ? Number(digits[column]) : null;
          return (
            <div key={column} className={styles.column}>
              <span className={styles.written} data-lead={digits && column < lead ? '' : undefined}>{digits?.[column] ?? ''}</span>
              {DIGITS.map((option) => (
                <i
                  key={option}
                  className={styles.bubble}
                  data-filled={digit === option ? '' : undefined}
                  style={{ '--delay': `${column * 110}ms` } as CSSProperties}
                >
                  [{option}]
                </i>
              ))}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/** Bars derived from the account label, so each account gets its own stable code. */
function barsOf(seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  const push = (width: number, gap: number) => { bars.push({ x, width }); x += width + gap; };
  push(1, 1); push(1, 1);
  for (let index = 0; index < 30; index++) {
    hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5;
    const value = hash >>> 0;
    push(1 + (value % 3), 1 + ((value >>> 4) % 2));
  }
  push(1, 1); push(1, 0);
  return { bars, width: x };
}

function Barcode({ seed }: { seed: string }) {
  const { bars, width } = useMemo(() => barsOf(seed), [seed]);
  return (
    <svg className={styles.barcode} viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" aria-hidden>
      {bars.map((bar) => <rect key={bar.x} x={bar.x} width={bar.width} height="40" fill="currentColor" />)}
    </svg>
  );
}

export function CandidateSheet({ state, onSignIn }: { state: QuestionRecordsState; onSignIn(): void }) {
  const account = useAccount();
  const context = useQuestionDatabase();
  const { records, activity } = state;
  const totals = useMemo(() => (records ? totalsOf(records) : null), [records]);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const streak = useMemo(() => (activity && mounted ? streakOf(activity) : null), [activity, mounted]);
  const user = account.phase === 'signed-in' ? account.user : null;
  const sync = describeSync(context);

  const status = user
    ? sync ?? { tone: 'ok' as const, text: '已登录' }
    : account.phase === 'disabled'
      ? { tone: 'muted' as const, text: '记录保存在这个浏览器' }
      : account.phase === 'loading'
        ? { tone: 'muted' as const, text: '正在读取登录状态…' }
        : { tone: 'muted' as const, text: '未登录，记录只保存在这个浏览器' };

  return (
    <section className={styles.sheet} aria-labelledby="candidate-title">
      <span className={styles.timing} aria-hidden />
      <header className={styles.head}>
        <h2 id="candidate-title" className={styles.heading}>考生信息</h2>
        <p className={clsx(page.state, styles.status)} data-tone={status.tone} role="status">{status.text}</p>
      </header>

      <div className={styles.grid}>
        <dl className={styles.fields}>
          <div>
            <dt>姓名</dt>
            <dd className={styles.name}>{user ? accountLabel(user) : '访客'}</dd>
          </div>
          <div>
            <dt>已提交</dt>
            <dd><strong>{fmt(totals?.submitted)}</strong>题</dd>
          </div>
          <div>
            <dt>做过题的日子</dt>
            <dd><strong>{fmt(activity ? activity.size : null)}</strong>天</dd>
          </div>
          <div>
            <dt>连续做题</dt>
            <dd><strong>{fmt(streak)}</strong>天</dd>
          </div>
        </dl>

        <NumberGrid value={totals ? totals.answered : null} />

        <div className={styles.slot}>
          <p className={styles.slotLabel}>贴条形码区</p>
          {user ? (
            <div className={styles.sticker}>
              <Barcode seed={accountLabel(user)} />
              <p className={styles.stickerId}>{accountLabel(user)}</p>
              <p className={styles.stickerNote}>作答记录跟着这个账号同步</p>
            </div>
          ) : (
            <div className={styles.slotBody}>
              <p className={styles.slotText}>
                {account.phase === 'disabled'
                  ? '这个站点没有启用云端账号，作答记录只保存在本机。'
                  : account.phase === 'loading'
                    ? '正在读取登录状态…'
                    : '登录后，作答记录跟着账号走，换一台设备也能接着做。'}
              </p>
              {account.phase === 'guest' ? (
                <button type="button" className={clsx(page.button, page.primary)} onClick={onSignIn}>
                  <LogInIcon aria-hidden />登录同步记录
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={styles.calendar}>
        <ActivityCalendar activity={activity} />
      </div>
    </section>
  );
}
