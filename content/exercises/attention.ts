import type { ReadingExercise } from '@/components/english-reading/types';

export const attentionExercise = {
  id: 'attention-01',
  title: 'The value of paying attention',
  source: '原创模拟文章 · 非历年真题',
  paragraphs: [
    [
      { id: 'p1s1', text: 'On an ordinary Tuesday, a group of volunteers walked through a small city park.' },
      { id: 'p1s2', text: 'Some listened to a podcast, while others were asked to put away their phones and notice the sounds, colours, and shapes around them.' },
      { id: 'p1s3', text: 'At the end of the walk, the second group felt calmer and remembered more of what they had seen.' },
      { id: 'p1s4', text: 'The difference surprised several volunteers, who had expected a familiar park to offer little worth noticing.' },
    ],
    [
      { id: 'p2s1', text: 'The following week, the volunteers returned to the park.' },
      { id: 'p2s2', text: 'They visited the same place, but this time they exchanged activities: those who had listened to a podcast now walked without headphones, and the others did the opposite.' },
      { id: 'p2s3', text: 'Once again, the people who observed their surroundings recalled more details.' },
      { id: 'p2s4', text: 'Because both groups experienced both activities in the same setting, the comparison helped the researchers separate the effect of attention from the appeal of a particular location.' },
    ],
    [
      { id: 'p3s1', text: 'The researchers concluded that it was the way people directed their attention, rather than simply being outdoors, that made the difference.' },
      { id: 'p3s2', text: 'A tree they had passed a hundred times became interesting again; a bird call that had once disappeared into background noise became distinct.' },
      { id: 'p3s3', text: 'This does not mean that podcasts are harmful, or that every walk should become a formal exercise.' },
      { id: 'p3s4', text: 'It suggests, instead, that constantly filling our attention can leave little room for experiences already within reach.' },
    ],
    [
      { id: 'p4s1', text: 'We often imagine that a memorable experience requires a distant journey or an expensive purchase.' },
      { id: 'p4s2', text: 'Yet the park experiment points to a more modest possibility: we can find something new in familiar surroundings by looking at them with fresh attention.' },
      { id: 'p4s3', text: 'The ordinary need not remain invisible just because it is ordinary.' },
      { id: 'p4s4', text: 'Before searching for a different world, we might begin by making a little more space to notice the one we already inhabit.' },
    ],
  ],
  questions: [
    {
      id: 'q1', skill: '细节理解', prompt: 'Why did the volunteers exchange activities during their second visit?', answer: 'B',
      options: [
        { id: 'A', text: 'To discover which part of the park was most attractive.', explanation: '原文保持地点不变，没有比较公园的不同区域。' },
        { id: 'B', text: 'To distinguish the effect of attention from that of the setting.', explanation: '第二次交换活动、保持地点一致，正是为了分离注意力与地点的影响。' },
        { id: 'C', text: 'To test whether a new podcast could improve their memory.', explanation: '实验并未更换或评估播客内容。' },
        { id: 'D', text: 'To encourage them to visit unfamiliar places.', explanation: 'same setting 表明两次都在同一个熟悉的地点。' },
      ],
      explanation: '定位第二段末句。separate the effect of attention from… 对应选项中的 distinguish…from…。交换活动让两组都体验两种方式，同时控制地点，是为了判断差异是否来自注意力。',
      evidence: ['p2s4'],
    },
    {
      id: 'q2', skill: '推理判断', prompt: 'What can we infer from the results of the two walks?', answer: 'C',
      options: [
        { id: 'A', text: 'A change of scenery is necessary for a memorable experience.', explanation: '地点未变，体验却发生了变化；necessary 扩大了结论。' },
        { id: 'B', text: 'Listening to a podcast always makes people anxious.', explanation: '原文没有证明焦虑，也明确反对将播客视为有害。' },
        { id: 'C', text: 'Paying attention to nearby details can enrich an ordinary experience.', explanation: '两次观察周围环境的人都记住更多细节，说明注意力能丰富日常体验。' },
        { id: 'D', text: 'People remember places better when they walk alone.', explanation: '独自散步不是实验比较的变量。' },
      ],
      explanation: '第一段给出初次结果，第三段概括原因：决定差异的是注意力的分配方式。由此可推知，留意身边细节可以改善平常的体验，而不需要改变地点。注意 always、necessary 等绝对表述。',
      evidence: ['p1s3', 'p3s1'],
    },
    {
      id: 'q3', skill: '词义猜测', prompt: 'The word “distinct” in Paragraph 3 is closest in meaning to _____.', answer: 'A',
      options: [
        { id: 'A', text: 'clearly noticeable', explanation: '鸟鸣从背景噪声中凸显，变得清晰可辨。' },
        { id: 'B', text: 'completely unfamiliar', explanation: '声音并不是新的，只是过去没有被留意。' },
        { id: 'C', text: 'unusually unpleasant', explanation: '上下文没有负面的情绪评价。' },
        { id: 'D', text: 'physically distant', explanation: '这里讨论感知的清晰程度，而非距离。' },
      ],
      explanation: '根据同一句的对照猜词：过去鸟鸣 disappeared into background noise，如今 became distinct。变化在于从被忽略到可辨认，因此 distinct 表示「清楚可察觉的」。',
      evidence: ['p3s2'],
    },
    {
      id: 'q4', skill: '作者态度', prompt: 'Which statement best describes the author’s view of podcasts?', answer: 'D',
      options: [
        { id: 'A', text: 'They should be avoided whenever people go outdoors.', explanation: '作者未要求户外活动时禁止播客。' },
        { id: 'B', text: 'They are the main cause of poor memory.', explanation: '原文没有将记忆问题归因于播客。' },
        { id: 'C', text: 'They are more valuable than direct observation.', explanation: '原文并未作出这种价值排序。' },
        { id: 'D', text: 'They are not necessarily harmful, but constant distraction has a cost.', explanation: '作者承认播客未必有害，同时提醒注意力被持续占满会错过身边体验。' },
      ],
      explanation: '作者先用 This does not mean… 限定结论，随后用 instead 表明真正关注的问题：持续占满注意力可能压缩感受周围世界的空间。D 同时保留了这个让步与提醒。',
      evidence: ['p3s3', 'p3s4'],
    },
    {
      id: 'q5', skill: '主旨大意', prompt: 'Which of the following is the best title for the passage?', answer: 'B',
      options: [
        { id: 'A', text: 'The hidden dangers of digital entertainment', explanation: '文章不是对数字娱乐的批判，这只涉及局部内容。' },
        { id: 'B', text: 'A fresh look at the familiar', explanation: '全文通过公园实验说明：用新的注意力看待熟悉环境，可以重新发现日常价值。' },
        { id: 'C', text: 'How to plan the perfect journey', explanation: '旅行只是最后一段的对照，不是全文论述对象。' },
        { id: 'D', text: 'Why city parks need more visitors', explanation: '公园是实验场景，文章没有讨论游客数量。' },
      ],
      explanation: '主旨题要同时看实验结论和结尾建议。第三段指出 attention 是关键，第四段把它推广为用 fresh attention 发现 familiar surroundings 中的新意。B 概括全文，其余标题只抓住局部词汇。',
      evidence: ['p3s1', 'p4s2'],
    },
  ],
} satisfies ReadingExercise;
