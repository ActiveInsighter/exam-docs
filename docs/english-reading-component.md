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

`EnglishReading` 在服务器端将既有 `ExamQuestion` / `ExamSolution` 内容转换为明确的文章和题目数据。普通题目组件直接使用原有解答组件，阅读工作区独立实现自己的展示，不依赖弹窗、Popover 或共享题目控制器。每道阅读题必须包含且只包含一个解答；没有短答案或原文依据的历史内容仍能显示完整解析。

宽屏左右并排显示文章和当前题目。窄屏使用「文章 / 题目」切换，同一 DOM 中保留两个区域的滚动位置。数字入口、上一题和下一题选择题目；每次换题清除旧解答和旧依据。首尾按钮禁用，同题重复点击不会重置状态。

悬停或键盘聚焦「查看解答」显示短答案；点击在题干下方展开完整解析。题干与解析共享一个滚动区域，题号和解答按钮始终在滚动区域外。展开时仅滚动题目区域到答案，不移动页面；收起和 Escape 恢复入口焦点。

展开解析会标出该题所有依据。点击「定位依据」只滚动文章区域到指定关键句，手机切换到文章；点击「返回题目」保留解析的滚动位置并恢复相应依据按钮的焦点。没有动画回调、定时自动跳转或逐句播放状态。

关键句使用原生行内文本和 `mark`，CSS 背景动画沿浏览器生成的文本片段绘制；换行、缩放、字体加载无需手动测量或绘制覆盖层。减少动态效果时直接显示最终标记。文章和题目在可用屏幕高度内滚动，轨道与背景一致，滚轮和触控到上下边界后按浏览器默认行为继续滚动页面。

客户端状态只有当前题号、解答展开、手机阅读区域、当前依据和一次重播编号。作者继续写普通 MDX；工作区只管理阅读和解析，没有独立题库、作答或评分系统。使用容器查询实现布局，不用 JavaScript 判断屏幕宽度。

回归、应用类型检查、静态构建和浏览器验收均运行在 GitHub Actions。浏览器验证用户流程、键盘与触控、横竖屏、滚动位置与焦点恢复、两端页面滚动传递、深色和减少动态效果。开发分支部署至 `exam-docs-preview`，main 部署至生产 `exam-docs`。
