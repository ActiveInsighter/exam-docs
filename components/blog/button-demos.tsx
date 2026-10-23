'use client';

import { BellIcon, CheckIcon, MoonIcon, StarIcon, WifiIcon } from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { Button, TileButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * Live demos of the click-to-fill buttons in components/ui/button.tsx
 * (TileButton and Button's `revealed`) for the blog's component showcase.
 * Registered only on blog pages (app/(home)/blog).
 */

function DemoFrame({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="not-prose my-6 flex flex-col gap-4 rounded-(--ui-radius-panel) bg-(--ui-fill) p-5 font-sans">
      {children}
      <p className="text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

const PLANS = [
  { id: 'month', title: '按月', detail: '随时取消，适合先试一试' },
  { id: 'year', title: '按年', detail: '相当于 10 个月的价格' },
  { id: 'team', title: '团队', detail: '5 人起，统一管理与账单' },
] as const;

/** A radio group of tiles: the pick fills from where it was pressed. */
function TilesDemo() {
  const [plan, setPlan] = useState<string>('year');
  return (
    <DemoFrame caption="TileButton + revealed：选中项的底色从点击位置以圆形扩散铺满，取消时收回到最近一次按下的位置；键盘（方向键、空格）选择时从中心扩散。">
      <div role="radiogroup" aria-label="套餐" className="grid gap-2.5 sm:grid-cols-3">
        {PLANS.map((item) => {
          const picked = plan === item.id;
          return (
            <TileButton
              key={item.id}
              role="radio"
              aria-checked={picked}
              revealed={picked}
              className={cn('items-start', picked && '[--tile-ring-width:1.5px] [--tile-ring:color-mix(in_oklch,var(--foreground)_28%,transparent)]')}
              onClick={() => setPlan(item.id)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--ui-fill-strong)] transition-colors',
                  picked && 'bg-foreground text-background shadow-none',
                )}
              >
                {picked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="grid gap-0.5">
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-muted-foreground">{item.detail}</span>
              </span>
            </TileButton>
          );
        })}
      </div>
    </DemoFrame>
  );
}

const TONES = [
  { label: '正确', color: 'var(--exam-correct-tint)', ring: 'var(--exam-correct-ring)' },
  { label: '错误', color: 'var(--exam-incorrect-tint)', ring: 'var(--exam-incorrect-ring)' },
  { label: '漏选', color: 'var(--exam-missed-tint)', ring: 'var(--exam-missed-ring)' },
] as const;

/** Any colour: set --reveal-color (and --tile-ring) per state. */
function TonesDemo() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <DemoFrame caption="填充颜色由 --reveal-color 决定，描边由 --tile-ring 决定：题目组件就是按判分结果切换这两个变量。点同一块可再次收回。">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {TONES.map((tone) => {
          const active = Boolean(on[tone.label]);
          return (
            <TileButton
              key={tone.label}
              size="lg"
              aria-pressed={active}
              revealed={active}
              className="justify-center font-medium"
              style={active ? { '--reveal-color': tone.color, '--tile-ring': tone.ring, '--tile-shadow': '0 0 #0000' } as CSSProperties : { '--reveal-color': tone.color } as CSSProperties}
              onClick={() => setOn({ ...on, [tone.label]: !active })}
            >
              {tone.label}
            </TileButton>
          );
        })}
      </div>
    </DemoFrame>
  );
}

const TOGGLES = [
  { id: 'star', label: '收藏', icon: StarIcon },
  { id: 'bell', label: '提醒', icon: BellIcon },
  { id: 'wifi', label: '离线可用', icon: WifiIcon },
  { id: 'moon', label: '夜间', icon: MoonIcon },
] as const;

/** Plain shadcn buttons with `revealed`: toggles that fill in. */
function TogglesDemo() {
  const [on, setOn] = useState<Record<string, boolean>>({ star: true });
  return (
    <DemoFrame caption="普通 Button 也支持 revealed：任何 variant 的按钮都可以加一层从点击处扩散的填充，例如开关按钮。">
      <div className="flex flex-wrap gap-2">
        {TOGGLES.map(({ id, label, icon: Icon }) => {
          const active = Boolean(on[id]);
          return (
            <Button
              key={id}
              variant="outline"
              size="lg"
              aria-pressed={active}
              revealed={active}
              className="h-10 rounded-full px-4 text-muted-foreground [--reveal-color:color-mix(in_oklch,var(--foreground)_11%,transparent)] aria-pressed:text-foreground"
              onClick={() => setOn({ ...on, [id]: !active })}
            >
              <Icon data-icon="inline-start" className={cn('transition-colors', active && 'fill-current')} />
              {label}
            </Button>
          );
        })}
      </div>
    </DemoFrame>
  );
}

const DEMOS = {
  tiles: TilesDemo,
  tones: TonesDemo,
  toggles: TogglesDemo,
};

export function ButtonDemo({ kind }: { kind: keyof typeof DEMOS }) {
  const Demo = DEMOS[kind];
  return <Demo />;
}
