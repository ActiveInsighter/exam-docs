# 通用模态弹窗 `Modal`

`components/ui/modal.tsx` 是站内通用的模态弹窗。它建在 Animate UI 的 Base UI Drawer
（`@animate-ui/react/primitives/base-ui/drawer`）之上：底层库负责开合、拖动关闭、焦点陷阱和滚动锁定。嵌套 Modal 自动成为同一面板内的页面，
`modal-navigation.tsx` 管理页面注册和保留状态，`panel-motion.tsx` 提供导航与切题共用的动效。写法与 shadcn 组件一致
（`data-slot`、`cva` 变体、`className` 可覆盖），没有独立的样式表；颜色、圆角与阴影是
`styles/tokens/components.css` 中的 `--modal-*` 变量。

题目的「查看解答」、「收藏与标签」、放大表格和做题记录都使用它。全部用法的现场演示见博客 [组件展示](/blog/component-showcase)。

## 结构

```tsx
<Modal open={open} onOpenChange={setOpen}>
  <ModalTrigger />                         {/* 可选；也可以受控打开 */}
  <ModalContent size="xl">
    <ModalHeader>                          {/* 把手、返回、关闭按钮自动渲染 */}
      <ModalTitle>标题</ModalTitle>
      <ModalTags><ModalTag>标签</ModalTag></ModalTags>
      <ModalToolbar>{/* 图标按钮 */}</ModalToolbar>
    </ModalHeader>

    <ModalBody>{/* 单栏内容 */}</ModalBody>
    {/* 或左右分栏 */}
    <ModalSplit columns="minmax(0,0.9fr) minmax(0,1.1fr)">
      <ModalPane tone="muted">…</ModalPane>
      <ModalPane>…</ModalPane>
    </ModalSplit>

    <ModalFooter>{/* 可选：底部按钮 */}</ModalFooter>
  </ModalContent>
</Modal>
```

| 组件 | 说明 |
| --- | --- |
| `Modal` | 根组件，属性同 Base UI `Drawer.Root`（`open`、`defaultOpen`、`onOpenChange`、`onOpenChangeComplete`、`actionsRef` 等）。 |
| `ModalTrigger` | 触发按钮，同 `Drawer.Trigger`（可用 `render` 换成任意元素）。 |
| `ModalContent` | 抽屉本体（遮罩、视口与弹窗）。`size` 限制 md 以上的最大宽度：`sm` 28rem、`md` 40rem（默认）、`lg` 56rem、`xl` 76rem、`full` 整屏；手机上始终铺满宽度。`height`：`auto`（默认）随内容伸缩，`fixed` 占满可用高度，或传 CSS 长度（如 `"36rem"`）；三者都不超过视口上限，固定高度适合内容会原地切换的弹窗。`initialFocus` 默认聚焦标题，`finalFocus` 默认回到触发按钮；其余属性传给 `Drawer.Popup`。 |
| `ModalHeader` | 固定顶栏。`showBack`（默认 `true`，仅子页面显示）、`showClose`（默认 `true`）。 |
| `ModalTitle` / `ModalDescription` | 无障碍标题与描述（`Drawer.Title` / `Drawer.Description`）。 |
| `ModalTags` / `ModalTag` | 标题旁的标签行，宽屏与标题同行，手机换到第二行横向滚动；为空时不占位。每个子元素使用半透明底色和细阴影，`ModalTag` 是现成的标签。 |
| `ModalToolbar` | 关闭按钮之前的操作区：一枚半透明胶囊，内部按钮保持透明、悬停时着色。 |
| `ModalBody` | 单栏滚动区。 |
| `ModalSplit` / `ModalPane` | md 以上左右分栏、各自滚动；手机合并为一列整体滚动。`columns` 设置列宽，`tone="muted"` 让该栏使用较浅底色，两栏不需要分割线。`ModalPane` 外层承载底色，内层滚动；`ref`、`className` 和其余属性落在内层滚动元素上。 |
| `ModalFooter` | 固定在底部的按钮区，含安全区内边距。 |
| `ModalBack` / `ModalClose` | 顶栏自动渲染的返回与关闭按钮，也可以单独使用。 |
| `useModal()` | 当前页：`depth`、`open`、`close()`、`closeAll({ returnFocus })`；不在弹窗内时为 `null`。 |
| `modalContentVariants` | 抽屉本体的 `cva` 变体，供需要同样外观的组件复用。 |

## 外观与动效

- **打开 / 关闭**：从屏幕底部滑入、向下滑出，时长与曲线使用 Animate UI 令牌（`transition.sheet` 进、`transition.dismiss` 出），进场不越过底边，离场略快，
  随 `AnimateUIProvider` 的 `tempo` 一起调整；遮罩同步淡入淡出。系统开启「减少动态效果」时改为原地淡入淡出。
  手机上贴边铺满宽度；md 以上居中、按 `size` 限宽，并悬浮在底边之上 0.75rem（`--modal-float`）。
  Base UI 只在「关闭 → 打开」的变化上播放进入动画，所以挂载时就已打开的弹窗（解答浮窗第一次点击才挂载）由 `Modal`
  推迟一次提交再打开，第一次打开同样有动画。
- **拖动关闭**：手机上按住抽屉任意位置下拉（内容滚动到顶后继续下拉也算），鼠标则拖顶栏；抽屉跟手移动、遮罩随之变浅。
  拖过一半或快速下滑即关闭，甩出的速度延续手指的速度，否则回弹。`ModalBody` / `ModalSplit` 是 `Drawer.Content`，
  鼠标在其中可以正常选中文字；横向滚动的元素加 `data-base-ui-swipe-ignore="x"`（`ModalTags` 已内置），
  完全不参与拖动的元素加 `data-base-ui-swipe-ignore`。
- **顶栏**：固定占据面板顶部的一行，手机标签另起一行；正文在下方原生滚动，不会滑到操作按钮后面。
  返回、关闭和工具栏保留半透明底色、柔和细边与阴影，避免在切题时实时采样背景。两栏背景保持固定，
  不使用大面积渐隐遮罩，也不测量顶栏高度；减少 GPU 合成和滚动时的额外绘制。
- **按钮与图标**：返回、关闭按钮是站内的 `Button`（Animate UI 的按压反馈），图标是 `components/animate-ui/icons/` 里的动画图标，
  悬停时播放。

## 同一面板内的多级页面

原有嵌套写法不变，子 Modal 不再创建新的 Drawer、遮罩或焦点陷阱：

```tsx
<ModalContent height="36rem">
  <ModalHeader><ModalTitle>题目</ModalTitle></ModalHeader>
  <ModalBody>…</ModalBody>
  <Modal open={next} onOpenChange={setNext}>
    <ModalContent>
      <ModalHeader><ModalTitle>收藏与标签</ModalTitle></ModalHeader>
      <ModalBody>…</ModalBody>
    </ModalContent>
  </Modal>
</ModalContent>
```

- **前进 / 返回**：同一宽高的面板内，原页向左轻移淡出，子页从右侧淡入；返回时方向反转。
  两者同步运行，快速反复操作不等待退场结束。子页的 `size` / `height` 由根面板决定。
- **状态**：覆盖的原页保留 DOM、输入、选择和滚动位置，同时设置 `inert` 和 `aria-hidden`；
  子页通过 portal 放在同一 Popup 的页面容器里。退出中的页面同样不可聚焦。
- **焦点**：进入时立即聚焦子页标题，根 dialog 的 `aria-labelledby` 指向当前页。
  返回时恢复该页的触发按钮焦点；根面板关闭后交回页面触发按钮。
- **返回 / 关闭**：返回按钮、Esc 和点击遮罩逐页返回；关闭按钮、`closeAll()`、整块面板向下拖动关闭整个面板。
  `closeAll({ returnFocus: false })` 用于链接跳转，避免焦点把新页面滚回旧位置。
- **减少动态效果**：只保留淡入淡出，不移动、缩放或滚动数字。原页仍保留状态。

需要任意长度内容时使用 `height="fixed"` 或 CSS 高度，让子页共享稳定的滚动空间。

## 学习卡片 `StudyCard`

`components/ui/study-card.tsx` 在 Modal 之上封装了一副可逐张翻看的卡片（题目与解析弹窗就是它）。
它只负责结构与动效，不含任何具体内容，也没有独立的样式表：

```tsx
<StudyCard open={open} onOpenChange={setOpen} count={items.length} index={index} onIndexChange={setIndex}>
  <StudyCardHeader title={item.title} tags={…} actions={…} />   {/* 翻页器自动并入工具栏 */}
  <StudyCardStage ratio={0.45}>
    <StudyCardAside>                {/* md 以上左栏、浅色底；手机在上 */}
      <StudyCardHero title subtitle badge />
      <StudyCardSection label="要点" meta="…">…</StudyCardSection>
    </StudyCardAside>
    <StudyCardMain>…</StudyCardMain>   {/* md 以上右栏；手机在下 */}
  </StudyCardStage>
  <Modal>…</Modal>                  {/* 同一面板内的子页 */}
</StudyCard>
```

- **切换**：顶栏玻璃翻页器（上一张 · 序号 · 下一张）、键盘 ←/→、触屏左右滑动（`StudyCardStage swipe={false}` 关闭，
  卡片里有横向滚动内容时使用）；`loop` 允许首尾循环。翻到两端时，焦点从变为禁用的按钮移到另一个方向的按钮上，方向键始终可用。
- **动画**：`PanelSwap` 以 `AnimatePresence mode="sync"` 在固定栏内同步播放退出和进入，按切题方向平移
  `shift.step` 并淡入淡出，使用 `transition.panelIn` / `panelOut`。背景和分栏不动，只动画内容；退出帧用局部 absolute 定位，不逐次插入全局 popLayout 样式。
  不在整块公式、图片上逐帧模糊，
  不为每个 section 创建 Motion 节点或堆叠延迟。退出卡片立即 `inert`；标题同步切换，序号使用 `SlidingNumber`。
  所有时间跟随 `tempo`，减少动态效果时只淡入淡出。
- **高度**：默认 `height="44rem"`、`size="lg"`，切换时不跳动；其余属性（`className`、`data-*`、`finalFocus` 等）传给 `ModalContent`。
- **色调**：`tint` 接受任意 CSS 颜色，左栏铺一层它的柔和底色；不传则使用 Modal 的浅色栏。
- **焦点**：焦点在旧卡内时切换后移到标题；`useStudyCard()` 提供 `index`、`count`、`direction`、`go`、`prev`、`next`。
- **窄屏工具栏**：同时有业务操作与翻页器时，宽度小于 24rem 的弹窗将工具栏放到独立一行，标题与关闭按钮仍在首行。
  横滑规则放在实际滚动区，保留长公式 / 表格的原生横向滚动和双指缩放；取消的触摸手势不会翻页。
- **编辑器**：输入区域保留自己的方向键；注释编辑器按 Esc 只取消编辑并恢复触发按钮焦点，再按 Esc 才关闭弹窗。

## 滚动条

全站滚动条轨道透明（`:root { scrollbar-color: var(--ui-scrollbar-thumb) transparent }`，该属性可继承），
滑块是半透明前景色，因此在页面、面板、卡片和弹窗上都与所在表面融为一体；不支持 `scrollbar-color` 的 Safari 用 `::-webkit-scrollbar` 兜底。

## 性能

每题一个「查看解答」，长页面上百个。触发按钮是普通 `<button>`，第一次点击才挂载 `Modal`；
解答卡片模块和子页（如「收藏与标签」）也在第一次打开时才加载；悬停或键盘聚焦解答按钮可预热模块。弹窗关闭后只保留根组件，遮罩、视口与内容都已卸载。
