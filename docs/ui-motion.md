# UI 动效

通用浮层使用 [Animate UI](https://animate-ui.com/docs/installation) 2.x 的
Base UI 适配层，依赖 `@animate-ui/react` 和 `motion`。业务组件仍从
`@/components/ui/*` 导入，不另建一套组件目录。

| 统一入口 | 动效 |
| --- | --- |
| `components/ui/dialog.tsx` | 遮罩渐变、弹窗进入与退出 |
| `components/ui/dropdown-menu.tsx` | 菜单开合、条目进入、选中背景滑动 |
| `components/ui/popover.tsx` | 从触发位置缩放进入、退出 |
| `components/ui/tooltip.tsx` | 提示出现、消失及连续悬停切换 |
| `components/ui/toggle.tsx` | 开关状态与按压反馈 |
| `components/ui/toggle-group.tsx` | 单选、多选与选中背景移动 |
| `components/ui/button.tsx` | 普通按钮的官方按压反馈，组合在原 Base UI 按钮上 |

这些入口只替换底层 primitive 导入，保留现有 API、样式、定位、语义和
`data-slot`。Motion 负责开合，组件上不再叠加 `animate-in`、`zoom-in`、
`slide-in` 等 CSS 开合动画。

`components/app-providers.tsx` 的 `AnimateUIProvider` 统一设置
`tempo={0.85}`，让高频学习操作更快；`reducedMotion="user"` 跟随系统的
减少动态效果偏好。调整通用节奏只改此处。

## 学习组件

`Modal` 的 Root、Portal、Backdrop、Popup 配套使用 Animate UI 的 Base UI Drawer。
官方 primitive 负责开合、拖拽、焦点与嵌套，组合层负责尺寸、分栏、磨砂顶栏与堆叠外观。
`StudyCard` 在其上处理翻页，使用官方步骤切换配方、方向感知的淡入淡出、轻微模糊及页码动画。

- `ui/ripple-button.tsx`：复用 `buttonVariants`，官方扩散与按压；键盘点击居中，锁定选项不再产生点击动效。
- `ui/icon-button.tsx`：官方图标按钮与粒子，收藏成功时显示粒子。
- `ui/action-icon.tsx`：图标默认呈现静态 Lucide，悬停、聚焦或按下时再初始化注册表的官方动画实例。按钮本身不重建；首次启用后保留实例，让中断的动效自然复位。长题目页无需一次初始化数百个图标动画观察器。
- `ui/collapsible.tsx`：shadcn 风格组合，官方高度、淡入和模糊过渡；判分面板不再维护自制卸载时机。
- `question/grade-control.tsx`：在 `ToggleGroup` 上统一填空与解答题判分。
- `question/grade-control.tsx` 的 `ResultIcon`：统一结果图标；只在用户操作后的结果上播放动画，恢复记录不重播。

旧 `TileButton`、`revealed`、`styles/reveal.css` 和对应令牌已移除。
数学键盘、MDX 标签页和 Fumadocs 导航保持各自的专用动效。
普通 `Button` 继续组合 Base UI 与官方 `AnimatedButton asChild`，保留 `render`、
`nativeButton`、禁用、焦点、ref 与调用方 `data-slot`；不再携带答题用的颜色扩散逻辑。

## 官方 Skill

官方来源：[Animate UI Skills](https://animate-ui.com/docs/skills)，源码位于
[`imskyleen/animate-ui/skills/animate-ui`](https://github.com/imskyleen/animate-ui/tree/main/skills/animate-ui)。
项目原版文件在 `.agents/skills/animate-ui/`，Claude Code 通过
`.claude/skills/animate-ui` 的相对符号链接共用；来源和内容哈希记录在
`skills-lock.json`。项目适配约定写在本文件与 `AGENTS.md`，不修改官方原文。

Skill 指导 AI 选择 CLI、primitive 导入替换或 Motion 配方，并涵盖：

- 统一弹簧、曲线、缩放、位移、模糊与 `tempo` 参数。
- 弹窗、菜单、抽屉、列表、按钮状态、表单、图标和页面动效的实现方式。
- 保留现有组件 API、样式、定位和 `data-slot`，清理重复的 CSS 动画。
- 减少动态效果、键盘与焦点、动画中断、触屏悬停和性能检查。
- 参考动画复现、动效审查，以及 Animate UI v1 到 v2 的迁移。

维护本项目时同时遵守上面的专用动效约定；Skill 中的通用示例不意味着
需要迁移已有抽屉、替换所有组件或增加无关动效。

## 浏览器验证

```bash
QUESTION_BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/verify-question-components-browser.mjs
QUESTION_BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/verify-study-motion-browser.mjs
```

第一个脚本覆盖全部题型、判分、解答、重载恢复与三种视口/主题组合；第二个覆盖收藏标签、键盘和快速翻页、三层嵌套返回/关闭、父层滚动与焦点恢复、鼠标/触摸拖拽。320px 解答顶栏将题目操作移到标签行，确保题号、翻页与关闭仍在同一行。
