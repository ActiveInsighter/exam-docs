# 数学分类模拟题 1031 导入记录

- 来源：[数学模拟题分类1031-三科合并版.zip](https://drive.google.com/file/d/1qq4nIwPHLWHTGIZU2GtGgAJ_x19uJRLx/view)。
- 导入日期：2026-11-01。
- 原包大小：454,091 字节。
- SHA-256：`85db74a8ab0fc01a7cf516684f542d7288992306d2ce63fc59b3933898856a19`。
- 原包备份：`public/downloads/math-classified-1031.zip`。
- 发布目录：`content/docs/math/classified-mock-exams/`。

| 科目 | 题目 | 专题 | 模块或章 |
| --- | ---: | ---: | ---: |
| 高等数学 | 336 | 47 | 9 |
| 线性代数 | 140 | 19 | 5 |
| 概率论与数理统计 | 140 | 16 | 5 |
| 合计 | 616 | 82 | 19 |

共导入 105 个 MDX 页面和 12 个 SVG 配图。所有题目使用
`classified-1031-<原题ID>`，避免与整套模拟卷的题目 ID 冲突。
配图复制到 `public/math-classified-1031/`，题内图片改用该目录下的绝对 URL。
导入时逐题核对 616 个 Question 块：去除这两项适配后与下载包完全一致。
随后使用项目的 `fix-strong-emphasis.mjs` 修复原包中不符合 CommonMark 的
加粗标点边界，保证页面不会显示多余星号；题意、答案、公式和解题步骤保持不变。
导航 JSON 统一设置 `defaultOpen: false`，入口按三科整理。
目录与专题入口链接统一转换成 `getShortDocSlugPath` 生成的实际 URL，避免
中文文件夹相对链接绕过压缩路由，以及新套卷目录绕过 1028 的兼容 URL。
原包说明、分类校验和来源清单保存在本目录，避免被内容加载器误作练习页面发布。

原 `math/exam/classified-1030/` 已删除。1028 的 20 份试卷按李林、李永乐、
汤家凤三组迁移为与张宇 8 套卷并列的套卷目录；这 20 份试卷与迁移前逐字节一致。
`lib/doc-paths.mjs` 保留原有 20 个公开 URL，题目 ID 不变，以继续匹配原有答题记录。
1028 的旧总览保留为兼容入口，主导航直接显示四组套卷。

内容调整后共有 851 个文档页面；部署流程的搜索、Markdown 和 HTML 数量断言
同步更新为 851、851 和 852（包含 `/docs/` 入口）。
