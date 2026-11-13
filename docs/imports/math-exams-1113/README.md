# 试卷整理1113 · Exam Docs / Fumadocs 可导入包

## 内容

- `content/docs/math/exam/hgdu-super-10-sets-2027/`：合工大超越数学一第 1—10 套；
- `content/docs/math/exam/ep-math1-3-sets-2027/`：EP 模拟预测数学一第 1—3 套；
- 合计 13 份独立试卷 MDX，286 题。每份 10 道选择题、6 道填空题、6 道解答题，共 150 分；
- 每个系列有独立的 `index.mdx` 导览及 `meta.json`；
- 4 张数学示意图存储于 `public/images/exams/`；
- `content/docs/math/exam/meta.json` 和 `index.mdx` 为基于 2026-11-13 查看 `ActiveInsighter/exam-docs` 的 `main` 分支现有导航生成的**合并版**，保留原有四个系列并新增两组。

## 部署方式

将本包内的 `content/`、`public/` 合并到 `exam-docs` 项目根目录，新增两组套卷文件及图片。**若目标仓库的现有 `content/docs/math/exam/index.mdx` 或 `meta.json` 后续又有更新，请合并新增导航，而不要盲目覆盖**。

- 此包已按 `source.config.ts` 中 `content/docs` 的内容根目录组织，组件无需显式 import：`Question`、`Option`、`Blank`、`Solution`、`Steps`、`Tabs`、`Callout` 已在 `components/mdx.tsx` 中注册。
- 公式沿用目标项目使用的 `$...$` 与 `$$...$$`，KaTeX 由 `remark-math`、`rehype-katex` 解析。
- 题目和解析的数学内容基于上传的 Markdown，经整理与部分校勘；源稿不自洽之处保留说明。**这不是对所有 286 道题作独立的数学正确性形式证明**。
- 源材料中 EP 的标题虽然标注「3+1」，但试题和答案均仅提供三套，未虚构第四套。

## 验证

本次进行了静态校验：286 个题目 ID 全库唯一，题目组件结构及选项答案数量匹配、分值合计 150 分，MDX frontmatter 和侧边栏 `meta.json`、索引链接、四张图片路径存在；同时检查 JSX 组件标签、公式定界符及相对结构。

**限制**：因当前会话没有在实际 Exam Docs 项目执行 `npm run build` 或 `npm run test`，仍需在项目引入后执行构建与题目测试，尤其由项目的 `remarkQuestion` 校验数学填空答案表达式。
