'use client';

import { AnimateIcon } from '@animate-ui/react/icons';
import { IconButton, IconButtonParticles } from '@animate-ui/react/primitives/buttons/icon';
import { scale } from '@animate-ui/react/utils/motion';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { BookOpenIcon } from '@/components/animate-ui/icons/book-open';
import { CheckIcon } from '@/components/animate-ui/icons/check';
import { GavelIcon } from '@/components/animate-ui/icons/gavel';
import { NotebookPenIcon } from '@/components/animate-ui/icons/notebook-pen';
import { RotateCcwIcon } from '@/components/animate-ui/icons/rotate-ccw';
import { StarIcon } from '@/components/animate-ui/icons/star';
import { TagIcon } from '@/components/animate-ui/icons/tag';
import { Button } from '@/components/ui/button';
import { RippleButton, RippleButtonSurface as RippleSurface, RippleButtonRipples } from '@/components/ui/ripple-button';
import { cn } from '@/lib/utils';

/*
 * Live demos of the site's buttons for the blog's component showcase: the
 * ripple button (components/ui/ripple-button.tsx), a ripple surface with
 * rich content (how the question options are built), and animated icons.
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

const VARIANTS = [
  ['default', '提交答案'],
  ['secondary', '查看解答'],
  ['outline', '加入错题本'],
  ['ghost', '跳过'],
] as const;

/** Every variant of the shared button, with a ripple from the point pressed. */
function RippleDemo() {
  return (
    <DemoFrame caption="RippleButton：站内按钮的全部 variant 都可用。按下时轻微缩小，涟漪从点击位置扩散，颜色随 variant 取前景色，也可以用 --ripple-button-ripple-color 指定。">
      <div className="flex flex-wrap gap-2">
        {VARIANTS.map(([variant, label]) => (
          <RippleButton key={variant} variant={variant} size="lg" className="h-10 rounded-full px-5">
            {label}
          </RippleButton>
        ))}
      </div>
    </DemoFrame>
  );
}

const PLANS = [
  { id: 'month', title: '按月', detail: '随时取消，适合先试一试' },
  { id: 'year', title: '按年', detail: '相当于 10 个月的价格' },
  { id: 'team', title: '团队', detail: '5 人起，统一管理与账单' },
] as const;

/** A radio group of ripple surfaces with rich content: the way question options are built. */
function TilesDemo() {
  const [plan, setPlan] = useState<string>('year');
  return (
    <DemoFrame caption="内容较多的可选卡片直接用 Ripple Button 的 primitive：整块按下时缩得更轻（scale.choice），涟漪铺过整行，选中状态用边框与底色的过渡表达。题目的选项就是这样做的。">
      <div role="radiogroup" aria-label="套餐" className="grid gap-2.5 sm:grid-cols-3">
        {PLANS.map((item) => {
          const picked = plan === item.id;
          return (
            <RippleSurface
              key={item.id}
              type="button"
              role="radio"
              aria-checked={picked}
              tapScale={scale.choice}
              className="isolate flex cursor-pointer items-start gap-3 rounded-[0.875rem] border border-(--exam-line) bg-(--ui-panel) px-3.5 py-3 text-left outline-none transition-colors duration-200 [--ripple-button-ripple-color:color-mix(in_oklch,var(--foreground)_18%,transparent)] hover:border-(--exam-line-hover) focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-(--exam-choice-ring-strong) aria-checked:bg-(--exam-choice-fill)"
              onClick={() => setPlan(item.id)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--ui-fill-strong)] transition-colors',
                  picked && 'bg-foreground text-background shadow-none',
                )}
              >
                {picked ? <CheckIcon size={12} strokeWidth={3} animate="path" /> : null}
              </span>
              <span className="grid gap-0.5">
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-muted-foreground">{item.detail}</span>
              </span>
              <RippleButtonRipples scale={24} style={{ zIndex: -1 }} />
            </RippleSurface>
          );
        })}
      </div>
    </DemoFrame>
  );
}

// The question card's result tones (styles/tokens/components.css).
const TONES = [
  ['correct', '正确'],
  ['incorrect', '错误'],
  ['missed', '漏选'],
] as const;

/** The ripple in any colour: one variable per state. */
function TonesDemo() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <DemoFrame caption="涟漪的颜色由 --ripple-button-ripple-color 决定，底色与边框是普通的颜色过渡：题目组件按判分结果切换这几个变量。">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {TONES.map(([name, label]) => {
          const active = Boolean(on[name]);
          return (
            <RippleButton
              key={name}
              variant="outline"
              size="lg"
              aria-pressed={active}
              style={{
                '--ripple-button-ripple-color': `var(--exam-${name})`,
                '--tone-tint': `var(--exam-${name}-tint)`,
                '--tone-line': `var(--exam-${name}-line)`,
                '--tone-ink': `var(--exam-${name}-ink)`,
              } as CSSProperties}
              className="h-12 rounded-[0.875rem] border-(--exam-line) bg-(--ui-panel) font-medium hover:bg-(--ui-panel) aria-pressed:border-(--tone-line) aria-pressed:bg-(--tone-tint) aria-pressed:text-(--tone-ink) dark:border-(--exam-line) dark:bg-(--ui-panel) dark:hover:bg-(--ui-panel)"
              onClick={() => setOn({ ...on, [name]: !active })}
            >
              {label}
            </RippleButton>
          );
        })}
      </div>
    </DemoFrame>
  );
}

const ICON_BUTTONS = [
  ['查看解答', BookOpenIcon],
  ['重做', RotateCcwIcon],
  ['手动判分', GavelIcon],
  ['标签', TagIcon],
  ['注释', NotebookPenIcon],
] as const;

/** Animated icons: played by pointing at their button; the favourite bursts. */
function IconsDemo() {
  const [starred, setStarred] = useState(false);
  return (
    <DemoFrame caption="图标来自 Animate UI 的图标库（components/animate-ui/icons）：把按钮包进 AnimateIcon，指到按钮上图标就动起来。收藏是 Icon Button：每次按下星星弹一下，点亮时散出一圈粒子。">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          type="button"
          aria-pressed={starred}
          aria-label="收藏"
          className={cn('grid size-10 place-items-center rounded-full bg-(--ui-panel) text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50', starred && 'text-warning hover:text-warning')}
          onClick={() => setStarred(!starred)}
        >
          <StarIcon size={18} animateOnTap className={cn(starred && 'fill-current')} />
          {starred ? <IconButtonParticles sideOffset={-20} radius={22} size={3} /> : null}
        </IconButton>
        {ICON_BUTTONS.map(([label, Icon]) => (
          <AnimateIcon key={label} animateOnHover asChild>
            <Button variant="secondary" size="lg" className="h-10 gap-2 rounded-full bg-(--ui-panel) px-4 hover:bg-(--ui-panel)">
              <Icon size={16} />
              {label}
            </Button>
          </AnimateIcon>
        ))}
      </div>
    </DemoFrame>
  );
}

const DEMOS = {
  ripple: RippleDemo,
  tiles: TilesDemo,
  tones: TonesDemo,
  icons: IconsDemo,
};

export function ButtonDemo({ kind }: { kind: keyof typeof DEMOS }) {
  const Demo = DEMOS[kind];
  return <Demo />;
}
