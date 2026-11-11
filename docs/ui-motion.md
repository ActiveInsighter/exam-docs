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

## 已有专用动效

`components/ui/modal.tsx` 的底部抽屉已经实现拖动关闭、嵌套页面、焦点恢复
和高度过渡，继续由 `styles/modal.css` 管理。其 Root、Portal、Backdrop、
Popup 配套使用原生 Base UI，不能混入需要 Animate UI Root 上下文的 Portal。
Title、Description、Close 继续复用现有 Dialog 封装。

`TileButton`、带 `revealed` 的答题按钮、卡片、数学键盘、MDX 标签页和
Fumadocs 导航继续使用各自已有的动效。普通 `Button` 通过官方
`AnimatedButton asChild` 组合，保留 Base UI 的 `render`、`nativeButton`、
禁用、焦点和 ref 行为；颜色等过渡不再覆盖 Motion 的 transform。

现有 shadcn 基础组件中，官方支持的都已接入。Avatar 暂无官方动效适配；
Input、Field、Label、Badge、Separator 没有可替换的动画 primitive，保持原样。
扩展接入时逐个检查 primitive 上下文及 CSS，避免重复动画。

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
