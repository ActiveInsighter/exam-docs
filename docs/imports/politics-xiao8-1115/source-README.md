# 肖8试卷整理1115 · Fumadocs / Exam Docs 导入包

## 适配目标

- GitHub 仓库：`ActiveInsighter/exam-docs`（按 `main` 分支现有 `content/docs/` 结构制作）。
- 文档目录：`content/docs/politics/mock-exams/xiao8-2027/`。
- 每套独立文件：`01.mdx`—`08.mdx`，按试卷顺序排列。
- 已补齐 `meta.json`、`index.mdx`，并按现有政治板块的目录规则更新父级 `politics/meta.json`、`politics/index.mdx`。

## 导入方法

将压缩包内 `content/` 与目标仓库根目录的同名目录合并。注意 `content/docs/politics/meta.json` 与 `content/docs/politics/index.mdx` 在该压缩包中是依据导出时 `main` 分支制作的导航合并版本；如果目标分支已有未同步改动，请人工合并两个文件，不要覆盖新改动。

检查 `pnpm build` 与目标仓库的题目内容测试（以当前仓库 `package.json` 中可用脚本为准），再发布。该压缩包自身不代表已经运行仓库构建。

## 内容与检查

- 共 **8 套 / 304 题 / 800 分**，每套 **38 题、100 分**。
- 各套包括单选 **16** 道、多选 **17** 道、材料分析题 **5** 道。
- 每题均有稳定唯一 `Question id`、相应题型与分值、`Solution` 解析；选择题使用 `<Option correct>` 标记标准答案。
- MDX 使用站点已有全局组件 `Question`、`Option`、`Solution`、`Tabs`、`Tab`、`Callout`、`Cards`、`Card`、`Accordions`、`Accordion`。
- 试卷文本来自用户提供的《27肖八试题-完整版》和《27肖八答案及解析-完整版》，并作格式整理及适度解析优化。
- 已做静态格式检查与题目数量、题型、计分、标签、正确选项数量、组件标签闭合和全库（此导入包内）题目 ID 唯一性检查。

## 注意

此压缩包不包含已有的 `historical-questions` 和 `classified-questions` 文档；解压合并时应保留仓库原有内容。
