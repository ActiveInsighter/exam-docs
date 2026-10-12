# 英语阅读理解排版

`EnglishReading` 是服务端排版组件，接收一个直接子元素 `ExamArticle` 和普通的 `ExamQuestion`，不解析题目或解答，也不新增客户端状态。

宽屏时文章在左侧，所有题目在右侧。文章跟随页面保持可见，长文章使用原生滚动；到达滚动边界后继续滚动页面。题目保持正常页面流。窄屏时文章与题目自然上下排列。

题目、选项、悬停答案和点击解答均复用现有组件，行为与其他文档一致。

```mdx
<EnglishReading>
  <ExamArticle title="A familiar park" source="原创模拟文章">
    <p>Paying attention can enrich an ordinary experience.</p>
  </ExamArticle>

  <ExamQuestion>
    <p>1. What can enrich an ordinary experience?</p>
    <ExamChoices>
      <ExamOption>A. Paying attention.</ExamOption>
      <ExamOption>B. Ignoring the surroundings.</ExamOption>
    </ExamChoices>
    <ExamSolution>
      <ExamAnswer>A</ExamAnswer>
      <ExamExplanation>文章说明，留意身边的细节可以丰富日常体验。</ExamExplanation>
    </ExamSolution>
  </ExamQuestion>
</EnglishReading>
```

增加题目只需继续添加 `ExamQuestion`，无需提供索引或关键句映射。
