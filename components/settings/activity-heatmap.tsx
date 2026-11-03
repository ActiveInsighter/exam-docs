'use client';

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { dayKey } from '@/lib/question-records';

/*
 * The reader's practice calendar: one column per week (Monday first), one
 * cell per day, filled by how many questions were worked on that day. The
 * newest week is on the right; on a narrow screen the grid scrolls and opens
 * scrolled to today.
 */

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const noop = () => () => {};

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
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);
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
  return { cells, months, max };
}

const describe = (cell: Cell) =>
  `${cell.date.getMonth() + 1}月${cell.date.getDate()}日 周${WEEKDAYS[(cell.date.getDay() + 6) % 7]}：${cell.count ? `做了 ${cell.count} 道题` : '没有做题'}`;

export function ActivityHeatmap({ activity, weeks = 26 }: { activity: ReadonlyMap<string, number> | null; weeks?: number }) {
  // The calendar depends on "today", which the static page cannot know: the
  // server renders empty cells and the browser fills in the real dates.
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
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold">做题日历</span>
        <span className="text-[13px] text-(--home-muted)">
          {!mounted || activity === null ? '正在读取…' : `近半年 ${activeDays} 天做过题，共 ${total.toLocaleString('zh-CN')} 题次`}
        </span>
      </figcaption>
      <div className="settings-heat-wrap relative mt-4">
        <div ref={scroller} className="overflow-x-auto pb-1 [scrollbar-width:thin]">
          <div className="inline-grid grid-cols-[auto_auto] gap-x-2 gap-y-1.5">
            <span className="sticky left-0 z-[1] bg-(--home-surface)" />
            <div className="settings-heat-months text-[11px] text-(--home-muted)" aria-hidden style={{ gridTemplateColumns: `repeat(${weeks}, var(--cell))` }}>
              {mounted && data.months.map((month) => (
                <span key={month.column} className="whitespace-nowrap" style={{ gridColumnStart: month.column + 1 }}>{month.label}</span>
              ))}
            </div>
            {/* Weekday labels stay put while a narrow screen scrolls the weeks. */}
            <div className="settings-heat-days sticky left-0 z-[1] bg-(--home-surface) pr-1 text-(--home-muted)" aria-hidden>
              {WEEKDAYS.map((label, index) => <span key={label}>{index % 2 === 0 ? label : ''}</span>)}
            </div>
            <div
              className="settings-heat"
              role="img"
              aria-label={`做题日历：近半年 ${activeDays} 天做过题，共 ${total} 题次。逐日明细见「学习记录」的按时间视图。`}
              onPointerMove={onPointer}
              onPointerLeave={() => setHover(null)}
            >
              {data.cells.map((cell, index) => (
                <span
                  key={index}
                  data-index={index}
                  data-level={cell.level}
                  data-future={mounted && cell.future ? '' : undefined}
                  data-today={mounted && cell.today ? '' : undefined}
                  data-hover={hover?.cell.key === cell.key ? '' : undefined}
                  className="settings-heat-cell"
                />
              ))}
            </div>
          </div>
        </div>
        {hover ? (
          <div
            role="presentation"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-(--home-foreground) px-2.5 py-1.5 text-xs whitespace-nowrap text-(--home-background) shadow-lg"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            <strong className="font-semibold">{hover.cell.count ? `${hover.cell.count} 道题` : '没有做题'}</strong>
            <span className="ml-1.5 opacity-70">{describe(hover.cell).split('：')[0]}</span>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-(--home-muted)" aria-hidden>
        少
        {[0, 1, 2, 3, 4].map((level) => <span key={level} data-level={level} className="settings-heat-cell" />)}
        多
      </div>
    </figure>
  );
}
