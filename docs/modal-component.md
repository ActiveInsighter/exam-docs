# 通用模态弹窗 `Modal`

`components/ui/modal.tsx` 是站内通用的模态弹窗，基于 shadcn 的 Dialog 与 Button（底层为 Base UI Dialog）。
外观与动效集中在 `styles/modal.css`，颜色、圆角、阴影与缓动曲线是 `styles/tokens/components.css` 中的 `--modal-*` 变量。
题目的「查看解答」和「收藏与标签」都使用它。

## 结构

```tsx
<Modal open={open} onOpenChange={setOpen}>
  <ModalTrigger />                         {/* 可选；也可以受控打开 */}
  <ModalContent size="xl" placement="center">
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
| `ModalContent` | 弹窗本体。`size`：`sm` 26rem、`md` 34rem（默认）、`lg` 48rem、`xl` 72rem、`full`；`placement`：宽屏为居中面板 `center`（默认）或底部抽屉 `sheet`，手机始终是底部抽屉。`initialFocus` 默认聚焦标题，`finalFocus` 默认回到触发按钮。 |
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

- **打开 / 关闭**：手机从底部滑入（`cubic-bezier(0.32, 0.72, 0, 1)`，520ms），关闭 340ms；
  宽屏居中面板由 97% 缩放、下方 0.75rem 处上浮淡入（420ms），关闭时快速淡出（200ms）。内容区比面板晚 60ms 淡入。
  遮罩同步淡入淡出，宽屏带轻微背景模糊。`prefers-reduced-motion` 时只保留短暂的透明度过渡。
- **沉浸式顶栏**：顶栏悬浮在内容之上，内容从顶栏下方滚过。内容一离开顶部，顶栏显示磨砂玻璃（模糊 + 提高饱和度），
  下缘 1.25rem 渐隐，没有生硬的分割线。顶栏高度由 `ResizeObserver` 写入 `--modal-header-h`，内容区据此留出顶部空间。
- **手机拖拽关闭**：按住顶栏（把手、标题、空白处）下拉，弹窗跟手移动、遮罩随之变浅；
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

- **显示**：下层缩小（每层 4%，手机 5%）、上移并变暗，顶部从新一层后方露出；新一层在手机上比下层略矮，层次清晰。
- **返回**：嵌套层顶栏左侧自动出现「返回」按钮；Esc、点遮罩或点下层露出的部分也只关闭最上一层，焦点回到打开它的按钮。
- **全部关闭**：嵌套层的关闭按钮（「全部关闭」）或 `useModal().closeAll()` 一次关闭整个栈，焦点回到最底层的触发按钮；
  链接跳转时用 `closeAll({ returnFocus: false })`，避免焦点把页面滚回原处。
- 下层关闭时，在它之上打开的各层随之关闭。

## 性能

每题一个「查看解答」，长页面上百个。触发按钮是普通 `<button>`，第一次点击才挂载 `Modal`；
嵌套层（如「收藏与标签」）也在第一次打开时才懒加载。滚动监听与 `ResizeObserver` 只在弹窗打开期间存在，关闭即释放。
