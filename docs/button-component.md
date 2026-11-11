# 按钮组件

统一入口保留 shadcn 的 `variant` / `size` 和 `buttonVariants`，动效复用 Animate UI：

| 组件 | 用途 | 行为 |
| --- | --- | --- |
| `Button` | 普通操作、Base UI 的 `render` 组合 | 官方按压，保留 Base UI 的语义、ref 和禁用 |
| `RippleButton` | 提交、查看解答、题目选项 | 官方点击扩散、按压；键盘点击居中 |
| `IconButton` | 收藏、注释、标签等 | 官方按压，可组合 `IconButtonParticles` |
| `ToggleGroup` | 单选/多选开关、自评判分 | Base UI 键盘导航，Animate UI 选中反馈 |

```tsx
import { RippleButton } from '@/components/ui/ripple-button';
import { IconButton, IconButtonParticles } from '@/components/ui/icon-button';

<RippleButton variant="secondary" size="sm">提交答案</RippleButton>
<IconButton aria-label="收藏" aria-pressed={favorite} onClick={toggleFavorite}>
  <StarIcon className={favorite ? 'fill-current' : undefined} />
  {favorite ? <IconButtonParticles /> : null}
</IconButton>
```

`RippleButton` 的 `choice` variant 支持换行的公式与文字；`size="choice"` 允许内容撑高。
`aria-disabled` 的已判分选项仍可聚焦阅读，但不触发扩散或点击回调。
默认渲染 `RippleButtonRipples`，需要自行放置时设置 `ripples={false}`；颜色通过
`--ripple-button-ripple-color` 控制。`tapScale` / `hoverScale` 透传官方 primitive，默认不悬停放大。

`Button` 保留 Base UI 的 `render` / `nativeButton`，另外两个组件接受原生 Motion button 属性。
减少动态效果与 `tempo` 由应用的 `AnimateUIProvider` 统一设置。

旧的 `TileButton` / `revealed` API、对应令牌与 `styles/reveal.css` 已删除；选择状态使用 `ToggleGroup` 或业务层的语义状态。
