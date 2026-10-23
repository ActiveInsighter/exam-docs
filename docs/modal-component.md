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
      <ModalTags>{/* 标签胶囊 */}</ModalTags>
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
| `ModalContent` | 弹窗本体，任何宽度都是底部抽屉。`size` 限制宽屏上的最大宽度：`sm` 28rem、`md` 40rem（默认）、`lg` 56rem、`xl` 76rem、`full` 整屏；手机上始终铺满宽度。`initialFocus` 默认聚焦标题，`finalFocus` 默认回到触发按钮。 |
| `ModalHeader` | 悬浮顶栏。`showBack`（默认 `true`，仅嵌套层显示）、`showClose`（默认 `true`）。 |
| `ModalTitle` / `ModalDescription` | 无障碍标题与描述，弹窗以标题命名。 |
| `ModalTags` | 标题旁的标签行，宽屏与标题同行，手机换到第二行横向滚动；为空时不占位。 |
| `ModalToolbar` | 关闭按钮之前的操作区，与关闭按钮之间有一条细分隔线。 |
| `ModalBody` | 单栏滚动区。 |
| `ModalSplit` / `ModalPane` | 宽屏左右分栏、各自滚动；手机合并为一列整体滚动。`columns` 设置宽屏列宽，`tone="muted"` 让该栏使用较浅底色，两栏不需要分割线。 |
| `ModalFooter` | 固定在底部的按钮区，含安全区内边距。 |
| `useModal()` | 当前层：`depth`、`open`、`close()`、`closeAll({ returnFocus })`。 |

所有部件都接受 `className`；`modal.css` 写在 `@layer components` 中，传入的 Tailwind 类会覆盖默认样式。

## 外观与动效

- **打开 / 关闭**：手机和宽屏一致，都是底部抽屉：从屏幕底部弹出（560ms），向下收回（380ms），
  打开、关闭、回弹与层叠共用一条曲线 `cubic-bezier(0.32, 0.72, 0, 1)`（`--modal-ease`）。宽屏居中并按 `size` 限宽。
  内容区比弹窗晚 80ms 淡入。遮罩同步淡入淡出。`prefers-reduced-motion` 时只保留短暂的透明度过渡。
- **顶栏**：悬浮在内容之上，内容从下方滚过。顶栏底色是其下方表面 90% 不透明度的同色（无模糊），
  内容未滚动时与表面融为一体，滚过时文字仍清晰，并出现一条细分隔线。左右分栏时顶栏两段分别取左右栏的底色
  （ModalSplit 测量第一栏宽度写入 `--modal-split-x`）；手机上分栏纵向排列，顶栏取当前滚到其下方那一栏的底色。
  顶栏高度由 `ResizeObserver` 写入 `--modal-header-h`，内容区据此留出顶部空间。
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

- **显示**：下层缩小（每层 4%）、上移 0.75rem 并变暗，顶部从新一层后方露出；每深一层最大高度少 0.75rem，层次清晰。
- **返回**：嵌套层顶栏左侧自动出现「返回」按钮；Esc、点遮罩或点下层露出的部分也只关闭最上一层，焦点回到打开它的按钮。
- **全部关闭**：嵌套层的关闭按钮（「全部关闭」）或 `useModal().closeAll()` 一次关闭整个栈，焦点回到最底层的触发按钮；
  链接跳转时用 `closeAll({ returnFocus: false })`，避免焦点把页面滚回原处。
- 下层关闭时，在它之上打开的各层随之关闭。

## 性能

每题一个「查看解答」，长页面上百个。触发按钮是普通 `<button>`，第一次点击才挂载 `Modal`；
嵌套层（如「收藏与标签」）也在第一次打开时才懒加载。滚动监听与 `ResizeObserver` 只在弹窗打开期间存在，关闭即释放。
