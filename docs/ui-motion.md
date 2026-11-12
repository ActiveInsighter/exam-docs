# UI 动效

项目使用 [Animate UI](https://animate-ui.com/docs/installation) 2.x、Base UI 和 Motion。
业务优先复用 `@/components/ui/*`；官方 primitive 负责通用交互，业务层负责内容、状态与组合。
不要重新维护拖拽关闭、点击扩散、收藏粒子或一套并行的浮层组件。

## 入口与边界

| 入口 | 职责 |
| --- | --- |
| `components/ui/dialog.tsx` | 常规 Dialog 的遮罩、开合和可访问性。 |
| `components/ui/modal.tsx` | Animate UI Base UI Drawer 的站内组合：底部抽屉、顶栏、滚动区、分栏和页面组合。 |
| `components/ui/study-card.tsx` | 组合 Modal，管理索引、方向、翻页器、键盘 / 触屏切换；不依赖题目业务。 |
| `components/ui/button.tsx` | Base UI Button + Animate UI 按压反馈，保留 Base UI 组合 API。 |
| `components/ui/ripple-button.tsx` | 官方涟漪 primitive + 共用按钮变体。 |
| `components/ui/dropdown-menu.tsx` / `popover.tsx` / `tooltip.tsx` | 官方浮层开合、定位与焦点。 |
| `components/ui/toggle.tsx` / `toggle-group.tsx` | 官方切换与按压反馈。 |
| `components/animate-ui/icons/` | 从官方注册表添加的动画图标。 |
| `components/question/live.tsx` | 长题目页的动画按需激活，不包含判分和持久化逻辑。 |

ModalContext 提供当前页 `close()`、面板 `closeAll()` 和返回焦点策略；
拖拽、滚动锁定和焦点陷阱由唯一的 Drawer 负责。
`modal-navigation.tsx` 管理子页，官方 Animate UI Tabs.Panel 负责多级子页切换；`panel-motion.tsx` 由 Motion AnimatePresence 负责同一张学习卡片内的同步换题，不另建拖拽或焦点陷阱。
详见 [Modal / StudyCard](modal-component.md) 与 [按钮](button-component.md)。

## 统一节奏与减少动态效果

`components/app-providers.tsx` 的 AnimateUIProvider 设置 `tempo={0.85}`、`reducedMotion="user"`。
其下的 ReducedMotionConfig 将同一策略传给自定义 Motion 节点；只设置 AnimateUIProvider
不会自动给所有自定义节点添加 MotionConfig。系统偏好变化时不重挂整棵应用，保留焦点与作答状态。

- 官方 primitive 使用自身动效，不叠加 CSS 开合动画。Drawer 的默认离场过快，站内弹窗只定制进出场与遮罩时长，保留官方拖拽、焦点及中断能力；关闭整张面板时冻结子页，退场完成后才清理状态。
- Modal 顶栏独立占位，正文原生滚动；不对大面积滚动区加 mask，不在顶栏下实时采样 backdrop-filter，不测量顶栏高度。
- 自定义动效使用 `@animate-ui/react/utils/motion` 的令牌，经 `useTempoTransition()` 调整节奏。
- 学习卡片翻页采用轻回弹弹簧（视觉持续约 280ms）配合 180ms 内容交叉淡入淡出；根 Drawer 入场采用轻弹簧（视觉持续约 340ms），离场不回弹以保持迅速关闭，遮罩与页面收尾一致。
- StudyCard 使用 `AnimatePresence` 同步衔接完整左右分栏，旧卡片不立刻卸载，新卡片无需等待旧卡片消失；标题共用 `PanelSwap`，序号使用 SlidingNumber。弹窗内的收藏等子页继续使用官方 Tabs.Panel。
- 换题时整块分栏采用轻微位移与交叉淡入淡出，不再叠加模糊；新旧卡片各保留独立滚动容器，避免切换帧强制重置旧题 scrollTop，固定外层高度不执行逐帧布局动画。
- transform 字符串用 `useShouldReduceMotion()` 消除位移；Motion 的 x / y / scale 由 ReducedMotionConfig 管理。
- 减少动态效果时保留状态提示和淡入淡出，停止位移、缩放与装饰性循环；CSS 动画另外处理 `motion-reduce:`。
- CSS 过渡只列实际变化的属性，不用 `transition-all`，不覆盖 Motion 的 transform。
- 判分图标复用官方 IconWrapper、controls 和节奏；`useFeedbackVariants` 让新对钩的首帧即为未绘制状态，避免 passive effect 启动前完整图形闪现。恢复的成绩直接显示完整图标。
- 解答题目副本只复制静态完成态：移除涟漪、Motion 的透明度/缩放/模糊和 SVG 绘制进度；依照序列化后的题目与判分数据更新，等价保存回执不替换副本，临时无法找到源 DOM 时保持上一帧，也不重置展开状态。

数学键盘、MDX 标签页与 Fumadocs 导航保留各自有用途的动效，不为统一形式而改写无关模块。
Avatar、Input、Field、Label、Badge、Separator 没有需要替换的动画 primitive。
已删除的 `styles/modal.css`、`styles/study-card.css`、`styles/reveal.css` 不再是扩展入口。

## 长页面

QuestionCard 使用模块级共享 IntersectionObserver：每张卡第一次接近视口时才启用
Pressable、Animated 和 liveIcon 的官方动画实现（Pressable 默认只按压，选项单独组合官方 RippleButton 与扩散层）；此前呈现外观相同、可操作的静态元素。
激活是一次性的，不在滚动离开后反复卸载。替换控件时恢复该题内的焦点，不重置作答或个人标记。
选项分栏另外批量测量视口附近的题目，避免水合时对全页强制布局。

解答弹窗 DOM 按需挂载，数学键盘和嵌套的收藏库代码按需加载；不得把每题的弹窗全部预挂载到长页面上。

## 验证

先运行 `npm run typecheck` 与相关测试，再用开发服务器渲染代表页面。完整生产 / 静态构建交给
GitHub Actions：`deploy-cloudflare-worker-assets.yml`，显式设置 `deploy=false`、`shards=8`。
类型检查分开运行浏览器应用和 Worker 测试，避免将 Worker 全局声明混入应用的 DOM 类型。

浏览器脚本使用 playwright-core；`QUESTION_BROWSER_MODULES` 可指定安装目录，
`QUESTION_BROWSER_EXECUTABLE` 指定浏览器，`DEPLOYMENT_URL` 指向开发或预览地址。

```bash
QUESTION_BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/verify-question-components-browser.mjs
QUESTION_BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/verify-study-motion-browser.mjs
QUESTION_BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/verify-question-feedback-browser.mjs
QUESTION_BROWSER_EXECUTABLE=/usr/bin/chromium QUESTION_RECORD_VIDEO=1 node scripts/verify-modal-motion-browser.mjs
```

`verify-modal-motion-browser.mjs` 会降低动画播放速度，逐帧验证弹入/弹出确实移动、关闭不露出父页、选项圆波确实扩大，保留视频与采样数据。不能只用“涟漪 DOM 存在”或静态截图替代。

检查桌面 / 窄屏、亮 / 暗色、系统减少动态效果、动画中间帧、连续快速操作，以及：

- 五种题型的作答、判分、自评、改判、重做与刷新恢复。
- 解答首开动效、前后翻卡、首尾键盘焦点、触屏滑动和关闭后焦点恢复。
- 子页返回 / Esc / 遮罩逐页返回，关闭按钮 / 整块拖动关闭面板；只有一个 Popup 和 Backdrop。
- 焦点不会落在离开或被覆盖的卡片里（inert），返回保留原页滚动和输入；长公式可横向滚动，页面没有横向溢出。
- 长页面在靠近视口前不挂载大量动画按钮，离开页面后观察器不持有旧卡片。

审查自定义动画可运行 `npx @animate-ui/cli@latest audit components/ui components/question`。
报告不包含官方 primitive 内部动效；文件内没有减少动态效果配置时，需结合上层配置判断。

## 官方资料与 Skill

- [Animate UI Drawer](https://animate-ui.com/docs/primitives/base-ui/drawer)
- [Base UI Drawer](https://base-ui.com/react/components/drawer)
- [shadcn Base UI Drawer](https://ui.shadcn.com/docs/components/base/drawer)
- [Animate UI Skills](https://animate-ui.com/docs/skills)

官方 Skill 原文位于 `.agents/skills/animate-ui/`，`.claude/skills/animate-ui` 通过相对符号链接共用；
来源与哈希记录在 skills-lock.json。项目约定放在本文件和 AGENTS.md，不修改官方 Skill 原文。
