# 按钮 `Button` / `TileButton`：点击处扩散填充

`components/ui/button.tsx` 是 shadcn 的 Button（Base UI 底层），在它上面扩展了两样东西：

- **`revealed`**：任何 `Button` 都能加一层填充色。`revealed` 变为 `true` 时，颜色从**按下的位置**以圆形扩散铺满按钮
  （Click-to-Fill Ripple / Radial Color Reveal）；变为 `false` 时收回到最近一次按下的位置。不传 `revealed` 就没有这层。
- **`TileButton`**：可选中的卡片按钮。内容可以换行、左对齐、放公式或图片；浅色卡面 + 细描边 + 柔和阴影，悬停提亮、按下微缩，
  默认带点击填充。题目的选项（`choice-group.tsx`）和判断按钮（`true-false.tsx`）都是它。
  `tileVariants({ interactive: false })` 给非按钮元素同样的外观（题目的静态选项列表）。

现场演示见博客 [组件展示](/blog/component-showcase)。

## 用法

```tsx
<TileButton role="radio" aria-checked={picked} revealed={picked} onClick={() => setPicked(true)}>
  …
</TileButton>

<Button variant="outline" aria-pressed={on} revealed={on} onClick={() => setOn(!on)}>
  提醒
</Button>
```

| 属性 / 变量 | 说明 |
| --- | --- |
| `revealed` | `true` 铺满、`false` 收回；`undefined` 不渲染填充层。 |
| `size`（TileButton） | `default`（≥3rem）、`sm`、`lg`。 |
| `--reveal-color` | 填充色。Button 默认是文字色 12% 的淡色；TileButton 默认 `--tile-fill`。 |
| `--reveal-x` / `--reveal-y` | 没有指针按下时（键盘、程序设置）扩散的圆心，默认中心。题目选项设为字母处。 |
| `--tile-bg` / `--tile-ring` / `--tile-ring-width` / `--tile-shadow` | TileButton 的卡面、描边与阴影，可按状态覆盖（题目按判分结果设置）。 |

令牌在 `styles/tokens/components.css`（`--tile-*`），填充层在 `styles/reveal.css`。

## 实现

- 指针按下时，按钮把按下点（相对按钮的百分比）和刚好覆盖整个按钮所需的半径写入元素的 `--reveal-x/-y/-r`，
  直接改元素样式，不触发 React 重新渲染。键盘触发（`click` 的 `detail === 0`）清除这些变量，回到默认圆心。
- 填充层是 `::before`，`clip-path: circle(r × progress at x y)`。只过渡一个注册为 `<number>` 的变量 `--reveal-on`，
  所以换一个按下点时圆心立即就位，只有半径在动；直接过渡 `clip-path` 会让圆心从上一个位置滑过来。
- 扩散 560ms（先快后慢，像墨水晕开），收回 320ms。完全铺满后额外加 300% 半径，按钮之后变大也始终铺满。
- `prefers-reduced-motion` 时填充立即切换。
