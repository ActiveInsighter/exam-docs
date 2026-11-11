# 按钮与点击反馈

业务组件从 `@/components/ui/*` 导入按钮。普通按钮保留 shadcn / Base UI 的组合 API；
需要点击扩散反馈时使用 Animate UI 的 RippleButton。两者共用 `buttonVariants`，
颜色、尺寸、禁用和焦点样式不会各维护一套。现场示例见 [组件展示](/blog/component-showcase)。

## 普通按钮 `Button`

`components/ui/button.tsx` 组合 Base UI Button 和 Animate UI 的 `AnimatedButton asChild`。
Base UI 负责按钮语义、`render`、`nativeButton`、禁用与 ref；Animate UI 负责按压反馈。
`data-slot` 默认是 `button`，调用方指定的 slot 会保留。

```tsx
import { Button } from '@/components/ui/button';

<Button variant="outline" size="sm" onClick={reset}>重做</Button>
<Button variant="ghost" size="icon" aria-label="关闭">
  <XIcon aria-hidden="true" />
</Button>
```

`variant`：`default`、`outline`、`secondary`、`ghost`、`destructive`、`link`。
`size`：`default`、`xs`、`sm`、`lg`、`icon`、`icon-xs`、`icon-sm`、`icon-lg`。
图标按钮必须提供可访问名称。文字旁的图标用 `data-icon="inline-start"` 或 `inline-end`。

## 扩散按钮 `RippleButton`

`components/ui/ripple-button.tsx` 封装官方
`@animate-ui/react/primitives/buttons/ripple`，复用上述样式变体。
它是原生 Motion 按钮，支持按钮属性、ref 和 Motion 属性；不接受 Base UI 的 `render` / `nativeButton`。
默认 `type="button"`，表单提交须显式传 `type="submit"`。

```tsx
import { RippleButton, RippleButtonRipples } from '@/components/ui/ripple-button';

<RippleButton variant="secondary" disabled={!canSubmit} onClick={submit}>
  提交答案
</RippleButton>

// 需要自行安放扩散层时关闭默认层。
<RippleButton ripples={false}>
  选择
  <RippleButtonRipples />
</RippleButton>
```

| 属性 / 变量 | 用途 |
| --- | --- |
| `variant` / `size` | 与 Button 共用的外观变体。 |
| `tapScale` | 按压缩放；不传时使用官方默认值。 |
| `hoverScale` | 官方可选属性；项目保持默认值 1，悬停只改变颜色。 |
| `ripples` | 默认 `true`；传 `false` 后自行安放 `RippleButtonRipples`。 |
| `--ripple-button-ripple-color` | 涟漪颜色，默认跟随按钮变体；题目按判分状态设置。 |
| `RippleButtonRipples scale` | 涟漪扩散范围；题目长选项使用 36，放在独立裁切层内。 |

涟漪是短暂的点击反馈。选中、判对、判错的持久外观由 `aria-checked`、`aria-pressed`、
`data-feedback` 和语义色变量表达，不依赖涟漪留在屏幕上。
旧 `TileButton`、`tileVariants`、`revealed`、`--reveal-*` 与 `styles/reveal.css` 已移除。

## 题卡与图标

长题目页使用 `components/question/live.tsx` 的 `Pressable`：首次接近视口前是同样外观的原生按钮，
接近后组合官方 RippleButton，避免上百道题在水合时一起挂载 Motion。
这是题卡的性能适配层；其他页面直接使用共享 UI 按钮。判分和存储仍由题目状态层负责。

操作图标用官方 `AnimateIcon` 包裹触发区；图标文件来自 Animate UI 注册表，位于
`components/animate-ui/icons/`。收藏使用官方 IconButton / IconButtonParticles，
只有新增收藏时出现粒子。题卡通过 `liveIcon` 在 Lucide 静态图标与动画图标之间切换。

动画节奏和减少动态效果统一由 [UI 动效约定](ui-motion.md) 管理。
