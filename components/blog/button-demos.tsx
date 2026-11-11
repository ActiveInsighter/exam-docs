'use client';

import { BellIcon, MoonIcon, WifiIcon } from 'lucide-react';
import { AnimateIcon } from '@animate-ui/react/icons';
import { type ReactNode, useState } from 'react';
import { CheckIcon } from '@/components/animate-ui/icons/check';
import { StarIcon } from '@/components/animate-ui/icons/star';
import { RippleButton } from '@/components/ui/ripple-button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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

function TilesDemo() {
  const [plan, setPlan] = useState(['year']);
  return (
    <DemoFrame caption="ToggleGroup 管理选择与方向键导航，Animate UI 提供按压反馈与选中背景切换。">
      <ToggleGroup
        variant="choice"
        size="choice"
        value={plan}
        onValueChange={(next) => {
          if (next.length) setPlan(next);
        }}
        className="grid w-full gap-2.5 sm:grid-cols-3"
      >
        {PLANS.map((item) => (
          <ToggleGroupItem key={item.id} value={item.id}>
            <CheckIcon aria-hidden="true" className="mt-1" />
            <span className="grid gap-0.5">
              <span className="font-medium">{item.title}</span>
              <span className="text-sm text-muted-foreground">{item.detail}</span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </DemoFrame>
  );
}

const TONES = [
  { value: 'correct', label: '正确' },
  { value: 'incorrect', label: '错误' },
  { value: 'partial', label: '漏选' },
] as const;
function TonesDemo() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <DemoFrame caption="RippleButton 复用按钮 variants，扩散效果由官方 primitive 提供；持久选中状态用语义颜色表达。">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {TONES.map(({ value, label }) => (
          <RippleButton
            key={value}
            variant="choice"
            size="choice"
            data-tone={value}
            aria-pressed={Boolean(on[value])}
            className="justify-center aria-pressed:border-(--tone-line) aria-pressed:bg-(--tone-tint) aria-pressed:text-(--tone-ink)"
            onClick={() => setOn({ ...on, [value]: !on[value] })}
          >
            {label}
          </RippleButton>
        ))}
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
function TogglesDemo() {
  const [on, setOn] = useState(['star']);
  return (
    <DemoFrame caption="多选开关使用 ToggleGroup，收藏图标直接复用 Animate UI 动画图标。">
      <ToggleGroup multiple variant="outline" value={on} onValueChange={setOn} className="max-w-full flex-wrap">
        {TOGGLES.map(({ id, label, icon: Icon }) => (
          <AnimateIcon key={id} animateOnHover asChild>
            <ToggleGroupItem value={id}>
              <Icon data-icon="inline-start" />
              {label}
            </ToggleGroupItem>
          </AnimateIcon>
        ))}
      </ToggleGroup>
    </DemoFrame>
  );
}

const DEMOS = { tiles: TilesDemo, tones: TonesDemo, toggles: TogglesDemo };
export function ButtonDemo({ kind }: { kind: keyof typeof DEMOS }) {
  const Demo = DEMOS[kind];
  return <Demo />;
}
