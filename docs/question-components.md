# 题目与解答组件

题目文档使用四个组件：`Question`、`Option`、`Blank`、`Solution`。组件已全局注册，MDX 中无需导入。
答案只写一次，并且写在结构化属性里：`Option` 的 `correct`、`Blank` 的 `answer`、判断题的 `answer`。
选项字母、题号和做题交互都由组件生成。

## 五种题型

| `type`     | 交互                     | 答案写在                          |
| ---------- | ------------------------ | --------------------------------- |
| `single`   | 点击选项立即判分         | 恰好一个 `<Option correct>`       |
| `multiple` | 选择后点击「提交答案」   | 至少两个 `<Option correct>`       |
| `boolean`  | 点击「正确 / 错误」判分  | `<Question answer={true|false}>`  |
| `blank`    | 逐空输入后提交           | 每个 `<Blank answer="…" />`       |
| `essay`    | 不自动判分，查看参考解答 | `<Solution>`                      |

### 单选 / 多选

```mdx
<Question id="408-ds-001" type="single">

算法的基本特征不包括（ ）。

<Option>有穷性</Option>
<Option>确定性</Option>
<Option>可行性</Option>
<Option correct>可读性</Option>

<Solution>

可读性不是算法必须具备的基本特征。

</Solution>

</Question>
```

- 选项不要手写 `A.`、`B.`，顺序就是显示顺序；选项前必须空一行，选项之间连续放置。
- 多选题把每个正确选项都标上 `correct`。

### 判断

```mdx
<Question id="os-014" type="boolean" answer={false}>

用户态线程的切换必须经过内核。

<Solution>

用户态线程可以在用户空间完成切换。

</Solution>

</Question>
```

### 填空

```mdx
<Question id="net-007" type="blank">

TCP 位于 OSI 的 <Blank answer="传输层" />，建立连接需要 <Blank answer="3" /> 次握手。

</Question>
```

`Blank` 的可选属性：`aliases={["运输层"]}` 接受其他写法；`tolerance={0.01}` 接受数值误差（支持 `1/2`、`50%`）。
比较前会做基础归一化（全角转半角、忽略大小写与空白、去掉句末句号），但不会判断数学表达式是否等价，
所以含公式的答案请用解答题。

### 解答

```mdx
<Question id="os-021" type="essay" points={10}>

简述进程与线程的主要区别。

<Solution>

1. 进程是资源分配的基本单位。
2. 线程是 CPU 调度的基本单位。

</Solution>

</Question>
```

## Question 属性

| 属性       | 说明                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `id`       | 必填。稳定的唯一标识（字母、数字、`.`、`_`、`-`），不要随题目顺序变化。    |
| `type`     | 必填。五种题型之一。                                                       |
| `answer`   | 仅判断题：`{true}` 或 `{false}`。                                          |
| `points`   | 可选。题目分值，正数。                                                     |
| `number`   | 可选。覆盖自动题号：`{15}` 从 15 重新计数，`"例 1"` 使用文字，`{false}` 不显示。 |

题号按文档顺序自动生成，从 1 开始；设置 `number={n}` 后后续题目接着 `n` 计数。
科目、年份、章节等元数据放在文件的 frontmatter，不要在每道题上重复。

## 结构规则

- `Option` 必须是 `Question` 的直接子元素，不能放进列表、引用或 `Solution`。
- `Solution` 放在最后，一道题至多一个；它不会直接显示在页面上，点击「查看解答」后在弹窗中展示。
- 题干可以自由使用 Markdown、公式、图片、表格和代码；`Question` 内的标题不会出现在目录中。

编译时会校验这些规则（`lib/remark-question.ts`）：id 缺失或重复、题型非法、单选没有恰好一个
`correct`、多选少于两个、选项不连续、`Solution` 不在最后、填空缺少 `answer` 等都会让构建报错，
并指出文件、行号和题目 id。`tests/question-content.test.ts` 会对 `content/docs` 下全部文档做同样的检查，
并要求 id 全局唯一。

## 版本哈希

编译时会为每道题写入 `data-question-revision`（题型、答案与题目正文的 SHA-1 前 8 位）。
将来保存做题记录时，请同时保存 `question_id` 与 `revision`，这样修改答案或解析之后，
历史记录仍能对应到当时的题目内容。选项应按位置连同 `revision` 保存，不要把显示的字母当作永久选项 id。

## 答题记录

选择题与填空题会把草稿、提交和重做后的状态保存到浏览器 IndexedDB，刷新后恢复。
登录由右上角的[账号菜单](account.md)负责；配置 Supabase 后，登录账号的答案会自动同步。
题目正文和标准答案继续由本文档管理。

账号隔离、数据库结构、冲突策略和部署步骤见 [题目数据库与本地优先同步](question-database.md)。
