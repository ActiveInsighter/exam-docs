# 通用模态弹窗 `Modal`

`components/ui/modal.tsx` 是站内通用的模态弹窗。它建在 Animate UI 的 Base UI Drawer
（`@animate-ui/react/primitives/base-ui/drawer`）之上：开合动画、拖动关闭、焦点管理、滚动锁定和多级嵌套都由底层库负责，
这个文件只做两件事：把各部件组合成站内的抽屉结构，用 Tailwind 类给它们上样式。写法与 shadcn 组件一致
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
| `ModalHeader` | 悬浮顶栏。`showBack`（默认 `true`，仅叠在别的弹窗之上时显示）、`showClose`（默认 `true`）。 |
| `ModalTitle` / `ModalDescription` | 无障碍标题与描述（`Drawer.Title` / `Drawer.Description`）。 |
| `ModalTags` / `ModalTag` | 标题旁的标签行，宽屏与标题同行，手机换到第二行横向滚动；为空时不占位。每个子元素都是磨砂玻璃（自带底色时请用半透明色），`ModalTag` 是现成的玻璃标签。 |
| `ModalToolbar` | 关闭按钮之前的操作区：一枚磨砂玻璃胶囊，内部按钮保持透明、悬停时着色。 |
| `ModalBody` | 单栏滚动区。 |
| `ModalSplit` / `ModalPane` | md 以上左右分栏、各自滚动；手机合并为一列整体滚动。`columns` 设置列宽，`tone="muted"` 让该栏使用较浅底色，两栏不需要分割线。`ModalPane` 外层承载底色，内层滚动；`ref`、`className` 和其余属性落在内层滚动元素上。 |
| `ModalFooter` | 固定在底部的按钮区，含安全区内边距。 |
| `ModalBack` / `ModalClose` | 顶栏自动渲染的返回与关闭按钮，也可以单独使用。 |
| `useModal()` | 当前层：`depth`、`open`、`close()`、`closeAll({ returnFocus })`；不在弹窗内时为 `null`。 |
| `modalContentVariants` | 抽屉本体的 `cva` 变体，供需要同样外观的组件复用。 |

## 外观与动效

- **打开 / 关闭**：从屏幕底部滑入、向下滑出，时长与曲线是 Animate UI 的抽屉令牌（`transition.drawer` 进、`transition.drawerOut` 出），
  随 `AnimateUIProvider` 的 `tempo` 一起调整；遮罩同步淡入淡出。系统开启「减少动态效果」时改为原地淡入淡出。
  手机上贴边铺满宽度；md 以上居中、按 `size` 限宽，并悬浮在底边之上 0.75rem（`--modal-float`）。
  Base UI 只在「关闭 → 打开」的变化上播放进入动画，所以挂载时就已打开的弹窗（解答浮窗第一次点击才挂载）由 `Modal`
  推迟一次提交再打开，第一次打开同样有动画。
- **拖动关闭**：手机上按住抽屉任意位置下拉（内容滚动到顶后继续下拉也算），鼠标则拖顶栏；抽屉跟手移动、遮罩随之变浅。
  拖过一半或快速下滑即关闭，甩出的速度延续手指的速度，否则回弹。`ModalBody` / `ModalSplit` 是 `Drawer.Content`，
  鼠标在其中可以正常选中文字；横向滚动的元素加 `data-base-ui-swipe-ignore="x"`（`ModalTags` 已内置），
  完全不参与拖动的元素加 `data-base-ui-swipe-ignore`。
- **顶栏**：没有底色。返回、关闭按钮是圆形的磨砂玻璃，工具栏是一枚玻璃胶囊，标签各自是玻璃小胶囊
  （`--modal-glass`、`--modal-glass-blur`、`--modal-glass-shadow`）。每个滚动区顶部有一段与顶栏等高的渐隐
  （Tailwind 的 `mask-t-*`），内容滚到顶栏下方时淡出，标题始终清晰；没有页脚时底部最后 1.5rem 同样淡出。
  顶栏高度由 `ResizeObserver` 测量后写到弹窗的 `--modal-header-h` 上，各滚动区据此留白和渐隐。
  手机上分栏合并为一列，弹窗底色取第一栏的色调，渐隐区与它衔接。把手只在触屏上显示。
- **按钮与图标**：返回、关闭按钮是站内的 `Button`（Animate UI 的按压反馈），图标是 `components/animate-ui/icons/` 里的动画图标，
  悬停时播放。

## 多级弹窗

在一个 `ModalContent` 内再渲染 `<Modal>`，它就是叠在上面的新一层（Base UI 的嵌套 Drawer）：

```tsx
<ModalContent>
  <ModalHeader>…</ModalHeader>
  <ModalBody>…</ModalBody>
  <Modal open={next} onOpenChange={setNext}>
    <ModalContent size="md">…</ModalContent>
  </Modal>
</ModalContent>
```

- **显示**：新一层从底部升起，各自决定宽高。它下面的每一层以底边为基准后退：每多一层缩小 4%、盖上一层暗色
  （`--modal-stack-dim`），并在会被完全挡住时上抬，使顶边在前一层上方露出 0.875rem；本来就更高的层不动。
  每深一层最大高度少 0.75rem，为后面露出的顶边留出位置。
- **实现**：全部是 CSS。Base UI 在弹窗上提供 `--nested-drawers`（上面叠了几层）、`--drawer-height`、
  `--drawer-frontmost-height` 和拖动进度 `--drawer-swipe-progress`，`modalContentVariants` 用它们算出
  `--stack-scale` 与 `--translate-y`，交给 Animate UI 抽屉的 transform；没有测量代码，也不需要注册表。
  拖动最上面一层时，后面的各层随进度逐步复位。
- **返回**：叠起的层顶栏左侧自动出现「返回」；返回、Esc、点击后面露出的层或向下拖走，都只关闭最上面一层，
  焦点回到打开它的按钮。
- **全部关闭**：叠起的层的关闭按钮（「全部关闭」）或 `useModal().closeAll()` 让整叠一起滑出，焦点回到最底层的触发按钮；
  链接跳转时用 `closeAll({ returnFocus: false })`，避免焦点把页面滚回原处。
- 下层被关闭时，叠在它上面的各层随之关闭。

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
  <Modal>…</Modal>                  {/* 叠在卡片之上的一层 */}
</StudyCard>
```

- **切换**：顶栏玻璃翻页器（上一张 · 序号 · 下一张）、键盘 ←/→、触屏左右滑动（`StudyCardStage swipe={false}` 关闭，
  卡片里有横向滚动内容时使用）；`loop` 允许首尾循环。翻到两端时，焦点从变为禁用的按钮移到另一个方向的按钮上，方向键始终可用。
- **动画**：按 Animate UI 的「步骤切换」配方，用 Motion 的 `AnimatePresence mode="wait"` 实现：当前卡片的内容先向离开的一侧
  移出并淡入轻微模糊（`transition.panelOut`），下一张再从另一侧进入（`transition.panelIn`），各 `StudyCardSection` 依次落位。
  移动的只是两栏里的内容，栏本身和它的底色不动，所以切换时卡片不会闪。标题同向切换，序号用 `SlidingNumber` 滚动。
  系统开启「减少动态效果」时只保留淡入淡出。
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
叠起的层（如「收藏与标签」）也在第一次打开时才懒加载。弹窗关闭后只保留根组件，遮罩、视口与内容都已卸载。
