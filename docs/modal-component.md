# 通用模态弹窗 `Modal`

`components/ui/modal.tsx` 是站内通用的模态弹窗，基于 shadcn 的 Dialog 与 Button（底层为 Base UI Dialog）。
外观与动效集中在 `styles/modal.css`，颜色、圆角、阴影与缓动曲线是 `styles/tokens/components.css` 中的 `--modal-*` 变量。
题目的「查看解答」和「收藏与标签」都使用它。全部用法的现场演示见博客 [组件展示](/blog/component-showcase)。

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
| `Modal` | 根组件，属性同 Base UI `Dialog.Root`（`open`、`defaultOpen`、`onOpenChange`、`actionsRef` 等）。 |
| `ModalContent` | 弹窗本体，任何宽度都是底部抽屉。`size` 限制宽屏上的最大宽度：`sm` 28rem、`md` 40rem（默认）、`lg` 56rem、`xl` 76rem、`full` 整屏；手机上始终铺满宽度。嵌套层至少与下层同宽。`height` 决定高度：`auto`（默认）随内容伸缩；`fixed` 占满可用高度；也可传 CSS 长度（如 `"36rem"`）固定为该高度。三者都不超过视口上限，固定高度适合内容会原地切换的弹窗（如逐张翻看的卡片），切换时不跳动。`initialFocus` 默认聚焦标题，`finalFocus` 默认回到触发按钮。 |
| `ModalHeader` | 悬浮顶栏。`showBack`（默认 `true`，仅嵌套层显示）、`showClose`（默认 `true`）。 |
| `ModalTitle` / `ModalDescription` | 无障碍标题与描述，弹窗以标题命名。 |
| `ModalTags` / `ModalTag` | 标题旁的标签行，宽屏与标题同行，手机换到第二行横向滚动；为空时不占位。每个子元素都是磨砂玻璃（自带底色时请用半透明色），`ModalTag` 是现成的玻璃标签。 |
| `ModalToolbar` | 关闭按钮之前的操作区：一枚磨砂玻璃胶囊，内部按钮保持透明、悬停时着色。 |
| `ModalBody` | 单栏滚动区。 |
| `ModalSplit` / `ModalPane` | 宽屏左右分栏、各自滚动；手机合并为一列整体滚动。`columns` 设置宽屏列宽，`tone="muted"` 让该栏使用较浅底色，两栏不需要分割线。`ModalPane` 外层承载底色，内层滚动；`ref`、`className` 和其余属性落在内层滚动元素上。 |
| `ModalFooter` | 固定在底部的按钮区，含安全区内边距。 |
| `useModal()` | 当前层：`depth`、`open`、`close()`、`closeAll({ returnFocus })`。 |

所有部件都接受 `className`；`modal.css` 写在 `@layer components` 中，传入的 Tailwind 类会覆盖默认样式。

## 外观与动效

- **打开 / 关闭**：手机和宽屏一致，都从屏幕底部弹出（560ms），向下收回（380ms），
  打开、关闭、回弹与层叠共用一条曲线 `cubic-bezier(0.32, 0.72, 0, 1)`（`--modal-ease`）。手机上贴边铺满宽度；
  宽屏上居中、按 `size` 限宽，并**悬浮**在底边之上 0.75rem（`--modal-float`），四角圆润、四周投影（`--modal-shadow-float`）。
  内容区比弹窗晚 80ms 淡入。遮罩同步淡入淡出。`prefers-reduced-motion` 时只保留短暂的透明度过渡。
  打开用关键帧动画而不是从 Base UI 的 `data-starting-style` 过渡：挂载时已经是打开状态的弹窗（解答浮窗第一次点击才挂载，
  「收藏与标签」懒加载）不会得到起始样式，过渡方式下会直接闪现；关闭仍是过渡到 `data-ending-style`。
- **顶栏**：没有底色。返回、关闭按钮是圆形的**磨砂玻璃**，工具栏是一枚玻璃胶囊，标签各自是玻璃小胶囊：
  半透明白（深色模式为半透明浅灰）加 `backdrop-filter: blur(18px) saturate(1.8)`，顶部一道高光描边与柔和投影
  （`--modal-glass`、`--modal-glass-blur`、`--modal-glass-shadow`），放在任何底色上都协调。
  标题之所以始终清晰，是因为每个滚动区自带**滚动边缘渐隐**：内容滚到顶栏下方时按 `--modal-header-h` 的高度柔和淡出
  （滚动区上的 `mask-image`，不随内容移动）；没有页脚时底部最后 1.5rem 同样淡出。
  宽屏分栏时遮罩只加在各栏的内层滚动元素上，栏的底色不受影响；手机上分栏合并为一列整体滚动，
  弹窗底色会取当前位于顶栏下方那一栏的色调（`data-under-tone`），淡出区与之无缝衔接。
  注意：顶栏及其祖先不能带 `mask`、`filter` 或小于 1 的 `opacity`，否则会成为 backdrop root，玻璃就模糊不到下方内容。
  顶栏高度由 `ResizeObserver` 测量后经 context 交给各滚动区，写成它们自己的 `--modal-header-h`（不继承的变量）。
  把手叠在顶部内边距上、不占高度；鼠标设备不显示把手。
- **拖拽关闭**：按住顶栏（把手、标题、空白处）下拉，弹窗跟手移动、遮罩随之变浅；鼠标同样可以拖。
  超过高度的 25%（最多 160px）或快速下滑即关闭，否则沿同一曲线回弹。从按钮、链接、输入框开始的拖动不会触发；
  其他元素可加 `data-modal-no-drag` 排除。
- 深色模式下弹窗底色比页面略亮，并有一圈细描边，读作浮在页面之上的一层。

## 多级弹窗

在一个 `ModalContent` 内再渲染 `<Modal>`，它就是上一层之上的新一层（Base UI 嵌套 Dialog）：

```tsx
<ModalContent>
  <ModalHeader>…<ModalToolbar><button onClick={() => setNext(true)}>下一层</button></ModalToolbar></ModalHeader>
  <ModalBody>…</ModalBody>
  <Modal open={next} onOpenChange={setNext}>
    <ModalContent size="md">…</ModalContent>
  </Modal>
</ModalContent>
```

- **显示**：各层像一叠卡片。最前一层贴着底边；它后面的每一层以自己的底边为基准后退（每层每侧收窄 16px，最多 5%）并变暗，
  只有会被前一层完全挡住时才抬起，在前一层上方露出 12px 的一条；比前一层高的下层保持原位、露出更多，不会被压下去。
  再往后一层退得更远、更暗；超过两层的不再显示。嵌套层至少与下层同宽，所以下层只从顶部露出，两侧不会出现悬空的边。
  每深一层最大高度少 0.75rem，为后面的各层留出位置。
- **实现**：同一个栈的各层共享 `createModalStack()`（根 `Modal` 创建）。打开的层把弹窗节点注册进去，栈测量各层高度，
  在后面各层上写 `--modal-stack-y`、`--modal-stack-scale` 与 `data-stacked`（前面有几层），`modal.css` 据此过渡 `translate`、`scale`
  并加暗层。这些变量注册为不继承，修改只重算弹窗本身的样式。层的高度或窗口尺寸变化时（`ResizeObserver`、`resize`）重新排布；
  前一层开始关闭时立即注销，后面的层与它的收回同时复位。
- **返回**：嵌套层顶栏左侧自动出现「返回」按钮；Esc、点遮罩或点下层露出的部分也只关闭最上一层，焦点回到打开它的按钮。
- **全部关闭**：嵌套层的关闭按钮（「全部关闭」）或 `useModal().closeAll()` 一次关闭整个栈，焦点回到最底层的触发按钮；
  链接跳转时用 `closeAll({ returnFocus: false })`，避免焦点把页面滚回原处。
- 下层关闭时，在它之上打开的各层随之关闭。

## 知识卡片 `KnowledgeCard`

`components/ui/knowledge-card.tsx` 在 Modal 之上封装了一副可逐张翻看的卡片，样式与动效在 `styles/knowledge-card.css`。
它只负责结构与动效，不含任何具体内容：

```tsx
<KnowledgeCard open={open} onOpenChange={setOpen} count={items.length} index={index} onIndexChange={setIndex}>
  <KnowledgeCardHeader title={item.title} titleMode="scrolled" tags={…} actions={…} />  {/* 翻页器自动并入工具栏 */}
  <KnowledgeCardStage columns="minmax(0,0.9fr) minmax(0,1.1fr)">
    <KnowledgeCardAside>                {/* 宽屏左栏、浅色底；手机在上 */}
      <KnowledgeCardHero title subtitle badge />
      <KnowledgeCardSection label="要点" meta="…">…</KnowledgeCardSection>
    </KnowledgeCardAside>
    <KnowledgeCardMain>…</KnowledgeCardMain>   {/* 宽屏右栏；手机在下 */}
  </KnowledgeCardStage>
</KnowledgeCard>
```

- **切换**：顶栏玻璃翻页器（上一张 · 序号 · 下一张）、键盘 ←/→、触屏左右滑动（`KnowledgeCardStage swipe={false}` 关闭，
  卡片里有横向滚动内容时使用）；`loop` 允许首尾循环。序号切换时向对应方向滚动。
- **动画**：新旧两张卡片同时存在、各自独立滚动：旧卡原地不动，内容向离开的一侧轻移、模糊并淡出；新卡在其上淡入，
  内容从另一侧滑入，左栏先、右栏晚 40ms。用 `knowledgeCardReveal(order)` 标记的行依次上浮（首次打开时也会）。
  新卡总是从顶部开始，旧卡不会跳动。`prefers-reduced-motion` 时只保留短暂淡入淡出。
- **高度**：默认 `height="44rem"`、`size="lg"`，切换时不跳动；其余属性（`className`、`data-*`、`finalFocus` 等）传给 `ModalContent`，
  调用方可借此按卡片改色调（如重定义 `--modal-pane-muted`）。
- **焦点**：焦点在旧卡内时切换后移到标题；`useKnowledgeCard()` 提供 `index`、`count`、`direction`、`go`、`prev`、`next`。

英语单词卡片（fumadocs-study 的 `components/vocabulary/word-card-detail.tsx`）就是它的一个使用者。

## 滚动条

全站滚动条轨道透明（`:root { scrollbar-color: var(--ui-scrollbar-thumb) transparent }`，该属性可继承），
滑块是半透明前景色，因此在页面、面板、卡片和弹窗上都与所在表面融为一体；不支持 `scrollbar-color` 的 Safari 用 `::-webkit-scrollbar` 兜底。

## 性能

每题一个「查看解答」，长页面上百个。触发按钮是普通 `<button>`，第一次点击才挂载 `Modal`；
嵌套层（如「收藏与标签」）也在第一次打开时才懒加载。滚动监听与 `ResizeObserver` 只在弹窗打开期间存在，关闭即释放。
