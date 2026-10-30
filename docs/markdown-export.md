# 面向 AI 的 Markdown 导出

静态站点的 `/docs/example.md` 下载、复制 Markdown 功能与开发环境的
`/llms.mdx/docs/…` 接口共用 `lib/markdown-export.mjs`。转换器读取原始 MDX，
先把题目属性转为正文，再清理组件外壳，避免在处理后的文本中丢失元数据。

## 题目格式

```markdown
**题目 15**

**题目 ID：** stack-1

**题型：** 单选题 (single)

**标签：** 来源:408 统考 2019；章节:栈与队列；易错

**分值：** 5

栈的容量至少为多少？

A. 2

B. 3

**答案：** B

**解析：**

需要保存三个元素。
```

- 标签支持逗号、中文逗号、顿号分隔的字符串，以及 JSON 字符串数组；保留分类前缀并去重。
- 题号按文档顺序生成；`number={15}` 重设计数，文字题号原样保留，`number={false}` 隐藏题号且不递增计数。
- 导出单选、多选、判断、填空与解答题；保留正确选项、填空参考答案及可接受的别名、解析、公式和题干。
- 阅读文章保留标题、译题和来源；Callout、Card、Tab、Accordion 保留标题，Card 保留描述，支持多行属性。
- 代码块与行内代码中的组件示例保持原样。转换器只读取静态字面量，不执行 MDX 中的 JavaScript 表达式。

这里的标签来自文档作者写入 MDX 的 `tags`。读者账号中的私人标签、收藏、注释和作答记录不属于公开文档源码。

## 维护与验证

- `lib/question-markdown.mjs`：题目及说明组件属性到 Markdown 正文的转换。
- `lib/markdown-export.mjs`：frontmatter 与组件外壳清理；随应用源码一起进入隔离构建目录。
- `scripts/static-docs-markdown.mjs`：静态文件路径、文件读取及共用转换器的入口。
- `lib/get-llm-text.ts`：通过 `getText('raw')` 复用静态转换器。
- `tests/question-markdown.test.ts`：元数据、多行属性、答案、代码示例和两个导出入口一致性的回归测试。

针对性验证：`npm test -- tests/question-markdown.test.ts tests/static-docs-build.test.ts`。
更改转换器后，已有线上静态 `.md` 文件需要在下一次构建发布时重新生成。
