# 英语阅读组件

`EnglishReading` 已注册为全局 MDX 组件。英语模块 `/docs/english` 是完整示例，文章为原创模拟内容，非真题或真实研究报道。

```mdx
---
title: 阅读训练
full: true
---

import { exercise } from '@/content/exercises/my-exercise';

<EnglishReading exercise={exercise} />
```

在 `content/exercises/` 中定义数据，使用 `ReadingExercise`（从 `@/components/english-reading` 导入）约束类型。每篇文章拥有唯一的 `id`、`title`、`source`，`paragraphs` 是按段组织的句子数组，句子包含唯一 `id` 和英文 `text`。题目包含唯一 `id`、`prompt`、`skill`、`options`、`answer`、中文 `explanation` 和 `evidence`。选项包含 `id`、英文 `text` 与中文 `explanation`；选错时展示该干扰项说明。`evidence` 按播放顺序引用句子 ID，可以跨段引用，不依赖文字搜索或字符偏移。

服务器组件在构建时校验题目答案、重复 ID 与证据引用。客户端 reducer 管理选项、答案展开与当前解析，动画完成事件带题目 ID、播放版本和证据序号，过期回调不会影响新题。

查看答案仅显示答案；查看解析同时显示答案并依次播放关键句。已播放的证据保留，换题或收起解析清除高亮。重播从第一句开始，重新作答清除所有选择与解析。组件实例通过 `useId` 隔离 DOM、radio 与展开区域，同页可放多组练习；换文章时应使用新的 exercise ID。

`components/reading-motion/` 从 clone-website 的 OpenAI 阅读效果移植测量与光标轨迹，缩减为受控的 `idle / playing / complete` 三态。原文保留自然换行、复制和选择能力，覆盖层与光标仅作装饰。仅当前证据创建测量观察器与动画帧，完成后停止帧循环；字体加载或容器宽度变化会重新测量。系统减少动态效果时直接显示高亮并隐藏光标。

桌面使用文章与题目各自滚动的双栏，组件容器小于 52rem 时改为上下排列，避免文档侧栏压缩正文。手机可在证据卡定位原文，并通过文章底部的「返回解析」回到题目。

测试、类型检查、静态构建与预览浏览器验收运行于 GitHub Actions，浏览器验收覆盖作答、答案和解析区分、跨题切换、多证据顺序、重播、重做、明暗主题、320/768/1024/1440 宽度以及减少动态效果。预览只部署至 `exam-docs-preview`。
