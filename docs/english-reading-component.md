# 英语阅读理解组件

`EnglishReading` 接收一个直接子元素 `ExamArticle` 和若干普通的 `Question`。服务端只做校验与拆分，题目、选项、判分与「查看解答」全部复用共享题目组件；客户端工作区（`components/english-reading/workspace.tsx`）负责版式与阅读工具，参考 Bluebook、TOEFL 等机考阅读界面。

## 版式

- **宽屏（卡片 ≥ 48rem）**：左侧原文、右侧题目，两栏各自滚动，中间分隔条可拖动、方向键调节、双击复位，宽度记在本机。卡片高度贴合文档面板，滚到两端时继续滚动页面。
- **窄屏**：顶部「原文 / 题目」切换条吸附在文档头部下方，页面自然滚动；题目区底部的「上一题 / 下一题」吸附在屏幕底部（此时右下角答题球让位）。
- **专注模式**：卡片浮于页面之上，Esc 退出。
- **打印**：原文与全部题目完整展开，不打印任何控件。

## 答题

- 一次显示一道题。题号条（答题卡）显示每题状态：未答、作答中、正确、部分正确、错误；当前题实心显示，答完后以结果色描边。
- 「上一题 / 下一题」在题目下方跟随；答完当前题后「下一题」变为主按钮。
- 所有题目始终挂载，只是不在布局中：判分状态、解答卡片的翻页、右下角答题球都照常工作。其他导航（答题球、解答卡片关闭后的焦点、`#question-…` 链接）通过 `revealQuestion`（`components/question/page-questions.ts`）请求显示某题，阅读卡片接管并切换过去。

## 阅读工具

- **译**：显示全部段落的中文；文章栏足够宽时中英左右对照。带翻译的段落，其段号本身是按钮，可只展开这一段。
- **字号**：小 / 中 / 大三档，记在本机；切换时保持当前阅读位置。
- **高亮**：选中原文出现「高亮」，点按已高亮处出现「清除」，标题栏可一键清除全部。用 CSS Custom Highlight API 绘制，不改动 DOM；按段落内字符偏移保存在本机（按页面与文章标题区分）。不支持该 API 的浏览器不显示高亮工具。
- **段落链接**：题干提到 “Paragraph 3”“Para. 2”“第 4 段” 时，题目下方出现「第 N 段」，点按跳到原文对应段并闪烁提示。
- **原文定位**：题目判分后，若原文中用 `<Evidence for="题目 id">` 标出了依据，题目下方出现「原文定位」，原文中的依据以绿色下划线标出；窄屏跳到原文后出现「回到第 N 题」。作答前不提示依据。

## 写法

```mdx
<EnglishReading>
  <ExamArticle title="A familiar park" titleTranslation="熟悉的公园" source="原创模拟文章">
    <Paragraph>
      <p>Some walked with headphones. <Evidence for="english-reading-001">Paying attention can enrich an ordinary experience.</Evidence></p>
      <Translation>有些人戴着耳机散步。留意身边的细节可以丰富日常体验。</Translation>
    </Paragraph>
  </ExamArticle>

  <Question id="english-reading-001" type="single">
    <p>What can enrich an ordinary experience, according to Paragraph 1?</p>

    <Option correct>Paying attention.</Option>
    <Option>Ignoring the surroundings.</Option>

    <Solution>文章说明，留意身边的细节可以丰富日常体验。</Solution>
  </Question>
</EnglishReading>
```

- `Paragraph` 与 `Translation` 可选；也可以直接写 `<p>`，同样自动编号。
- `Evidence` 可选，一道题可标多处；导出的 Markdown 只保留其中文字。
- 增加题目只需继续添加 `Question`，无需索引或映射。
