# 英语阅读组件

阅读题复用本站既有的 `ExamQuestion`、`ExamChoices`、`ExamOption`、`ExamSolution`、`ExamAnswer` 和 `ExamExplanation`。新增的 `EnglishReading` 负责布局，`ExamArticle` 组织文章，`ExamKeySentence` 标记可引用的关键句。这些组件已全局注册，Dynamic MDX 中无需导入。

```mdx
<EnglishReading>
<ExamArticle title="A fresh look at the familiar" source="原创模拟文章">

An ordinary walk can change when we
<ExamKeySentence id="attention">pay attention to familiar surroundings.</ExamKeySentence>

</ExamArticle>

<ExamQuestion>

1. What makes the difference?

<ExamChoices>
<ExamOption>A. A new location.</ExamOption>
<ExamOption>B. Fresh attention.</ExamOption>
</ExamChoices>

<ExamSolution evidence={['attention']}>
<ExamAnswer>B</ExamAnswer>
<ExamExplanation>

关键句中的 attention 对应选项 B。

</ExamExplanation>
</ExamSolution>

</ExamQuestion>
</EnglishReading>
```

文章与解答可继续写普通 MDX，包括段落、列表、强调、链接、数学等。关键句只需提供在本篇文章内唯一的 ID；`ExamSolution.evidence` 按需要的播放顺序引用一个或多个 ID。服务器在构建时验证文章数量、重复 ID 和证据引用。

`ExamQuestion` 原有结构与参数保持不变。位于 `EnglishReading` 内时，解答入口悬停/键盘聚焦显示短答案，点击原位置附近的同一面板显示完整解答，并在左侧依次定位、选中关键句。再点击入口、关闭按钮、Escape 或外部区域关闭；重播从第一条依据开始。阅读之外的题目继续使用现有答案预览和模态解答。

客户端只有一个当前解答状态，包含解答 ID、证据列表、证据序号和播放版本。没有独立的题库、选项作答或评分系统。上下文只负责解答展示与证据联动，文章与题目仍由服务器渲染，动画沿用 `reading-motion` 的逐行测量与光标轨迹。

解答面板使用 Fumadocs 已依赖的 Popover，库负责定位、边界避让、Portal 和键盘关闭，无新增依赖或手写浮层定位。面板不锁住页面滚动；可以继续阅读文章。每题最大高度为可视屏幕高度减去顶部导航留白，超出后题内滚动；文章与解析面板也使用与各自背景一致的滚动条轨道。

桌面文章在左侧保持可见，题目在右侧沿文档流排列。窄屏上下排列。关键句 ID 在每个阅读实例内解析，同页多篇文章可使用相同的局部 ID。减少动态效果时直接显示高亮，字体加载或排版宽度变化后重新测量。

回归、应用类型检查、静态构建和浏览器验收均运行在 GitHub Actions；预览部署至 `exam-docs-preview`。
