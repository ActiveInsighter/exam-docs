'use client';

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from 'react';
import { dayKey } from '@/lib/question-records';
import styles from './activity-calendar.module.css';

/*
 * The reader's practice calendar: one column per week (Monday first), one
 * box per day, shaded by how many questions were worked on that day. The
 * newest week is on the right; on a narrow screen the strip scrolls and
 * opens scrolled to today.
 */

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const noop = () => () => {};
const numberFormat = new Intl.NumberFormat('zh-CN');

interface Cell {
  key: string;
  date: Date;
  count: number;
  level: number;
  future: boolean;
  today: boolean;
}

/** Four steps relative to the busiest day, so a light and a heavy learner both get a readable map. */
function levelOf(count: number, max: number): number {
  if (!count) return 0;
  const top = Math.max(max, 4);
  return Math.min(4, Math.max(1, Math.ceil((count / top) * 4)));
}

function buildWeeks(activity: ReadonlyMap<string, number>, weeks: number, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  let max = 0;
  const days: Omit<Cell, 'level'>[] = [];
  for (let index = 0; index < weeks * 7; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dayKey(date);
    const count = activity.get(key) ?? 0;
    max = Math.max(max, count);
    days.push({ key, date, count, future: date > today, today: date.getTime() === today.getTime() });
  }
  const cells: Cell[] = days.map((day) => ({ ...day, level: levelOf(day.count, max) }));
  // A month label sits over the week that contains the month's first day.
  const months: { column: number; label: string }[] = [];
  for (let column = 0; column < weeks; column++) {
    const week = cells.slice(column * 7, column * 7 + 7);
    const first = column === 0 ? week[0] : week.find((cell) => cell.date.getDate() === 1);
    if (!first) continue;
    const month = first.date.getMonth() + 1;
    const label = month === 1 ? `${first.date.getFullYear()}年1月` : `${month}月`;
    if (months.length && column - months[months.length - 1].column < 3) continue;
    months.push({ column, label });
  }
  return { cells, months };
}

const dateLabel = (cell: Cell) => `${cell.date.getMonth() + 1}月${cell.date.getDate()}日 周${WEEKDAYS[(cell.date.getDay() + 6) % 7]}`;

export function ActivityCalendar({ activity, weeks = 52 }: { activity: ReadonlyMap<string, number> | null; weeks?: number }) {
  // The calendar depends on "today", which the static page cannot know: the
  // server renders empty boxes and the browser fills in the real dates.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const now = useMemo(() => (mounted ? new Date() : new Date(0)), [mounted]);
  const data = useMemo(() => buildWeeks(mounted ? activity ?? new Map() : new Map(), weeks, now), [mounted, activity, weeks, now]);
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && mounted) node.scrollLeft = node.scrollWidth;
  }, [mounted]);

  const activeDays = data.cells.filter((cell) => cell.count > 0).length;
  const total = data.cells.reduce((sum, cell) => sum + cell.count, 0);
  const loading = !mounted || activity === null;

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    const box = scroller.current?.parentElement?.getBoundingClientRect();
    if (!target || !box) { setHover(null); return; }
    const cell = data.cells[Number(target.dataset.index)];
    if (!cell || cell.future) { setHover(null); return; }
    const rect = target.getBoundingClientRect();
    setHover({ cell, x: rect.left + rect.width / 2 - box.left, y: rect.top - box.top });
  };

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>做题日历</span>
        <span className={styles.summary}>
          {loading ? '正在读取…' : (
            <>近一年 <strong>{numberFormat.format(activeDays)}</strong> 天做过题，共 <strong>{numberFormat.format(total)}</strong> 题次</>
          )}
        </span>
      </figcaption>
      <div className={styles.frame}>
        <div ref={scroller} className={styles.scroller}>
          <div className={styles.board} style={{ '--weeks': weeks } as CSSProperties}>
            <span className={styles.corner} />
            <div className={styles.months} aria-hidden>
              {mounted && data.months.map((month) => (
                <span key={month.column} style={{ gridColumnStart: month.column + 1 }}>{month.label}</span>
              ))}
            </div>
            {/* Weekday labels stay put while a narrow screen scrolls the weeks. */}
            <div className={styles.days} aria-hidden>
              {WEEKDAYS.map((label, index) => <span key={label}>{index % 2 === 0 ? label : ''}</span>)}
            </div>
            <div
              className={styles.cells}
              role="img"
              aria-label={`做题日历：近一年 ${activeDays} 天做过题，共 ${total} 题次。逐日明细见「学习记录」的按时间视图。`}
              onPointerMove={onPointer}
              onPointerLeave={() => setHover(null)}
            >
              {data.cells.map((cell, index) => (
                <i
                  key={index}
                  data-index={index}
                  data-level={cell.level || undefined}
                  data-future={mounted && cell.future ? '' : undefined}
                  data-today={mounted && cell.today ? '' : undefined}
                  data-hover={hover?.cell.key === cell.key ? '' : undefined}
                  className={styles.cell}
                />
              ))}
            </div>
          </div>
        </div>
        {hover ? (
          <div role="presentation" className={styles.tip} style={{ left: hover.x, top: hover.y - 8 }}>
            <strong>{hover.cell.count ? `${hover.cell.count} 道题` : '没有做题'}</strong>
            <span>{dateLabel(hover.cell)}</span>
          </div>
        ) : null}
      </div>
      <div className={styles.legend} aria-hidden>
        少<i /><i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" />多
      </div>
    </figure>
  );
}
