# 2026-11-15 肖8导入记录

- 来源：[肖8试卷整理1115.zip](https://drive.google.com/file/d/1bXcJgdavE2KYfN-dEfMZRFR7buAkGTbR/view)，Drive 文件 ID：`1bXcJgdavE2KYfN-dEfMZRFR7buAkGTbR`。
- 在线位置：政治 → 肖8，路由 `/docs/politics/xiao8/`。第一至第八套分别位于 `01/`—`08/`。
- 共 8 套、304 题、800 分；每套单选 16 题（16 分）、多选 17 题（34 分）、材料分析 5 题（50 分）。保留原有稳定题目 ID、题干、选项、正确答案、解析和材料题背诵框架。
- 使用站点现有 Question / Option / Solution 交互组件，保留分值、题号、来源、试卷、科目和考点标签；材料题采用自评。
- 将来件的 `politics/mock-exams/xiao8-2027/` 调整为政治模块直属 `xiao8/`，导航名称为“肖8”；人工合并政治首页和导航，保留既有历年真题、分类真题。
- 索引卡片改为完整站内路径，避免有无末尾斜线时相对地址解析不一致。
- 用仓库现有 `fix-strong-emphasis.mjs` 修复 86 处 CommonMark 加粗边界；只调整强调标记和相邻标点，不改写题目和解答。
- 新增 9 个在线页面，同步部署校验为 792 个可搜索 Markdown 页面、793 个文档 HTML 路由（含文档入口）。
- `import-manifest.json` 保存来件 ZIP、原始各卷和导入各卷的 SHA-256，以及逐卷题数、题型、分值核验结果；`source-README.md` 保留来件原说明，其目录路径描述的是导入前结构。
- 已逐题检查题型、题号、分值、Solution、四个选择项、正确选项数量及 304 个 ID 唯一性；应用和 Worker 类型检查通过。完整生产构建交由现有 GitHub Actions 的 8 分片流程执行。
