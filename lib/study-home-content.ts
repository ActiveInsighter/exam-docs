export type HomeSubject = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  href: string;
  icon: 'math' | 'computer' | 'english' | 'politics' | 'code';
  topics: readonly [string, string, string];
  previewTitle: string;
  previewDescription: string;
  sections: readonly [
    { title: string; description: string; href: string },
    { title: string; description: string; href: string },
    { title: string; description: string; href: string },
  ];
  formula?: string;
};

export const homeSubjects: readonly HomeSubject[] = [
  {
    id: 'math',
    name: '考研数学',
    shortName: '数学',
    description: '从一道真题开始，把高等数学、线性代数与概率论练得更扎实。',
    href: '/docs/math/',
    icon: 'math',
    topics: ['历年真题', '核心题目', '模拟训练'],
    previewTitle: '理解思路，再动笔解题。',
    previewDescription: '按真题、核心题目与模拟题组织训练，回到具体题目检验每一处知识。',
    sections: [
      { title: '数学真题', description: '按章节与题型回顾历年考点。', href: '/docs/math/past-exams/' },
      { title: '考研核心题目', description: '集中训练值得反复掌握的题目。', href: '/docs/math/core-questions/' },
      { title: '数学模拟题', description: '用成套试题检验综合解题能力。', href: '/docs/math/exam/' },
    ],
    formula: '∫ f(x) dx = F(x) + C',
  },
  {
    id: '408',
    name: '计算机 408',
    shortName: '408',
    description: '连接数据结构、组成原理、操作系统与网络，用题目串起四门课。',
    href: '/docs/408/',
    icon: 'computer',
    topics: ['模拟选择题', '历年真题', '综合大题'],
    previewTitle: '四门课程，一起练透。',
    previewDescription: '从模拟选择题到历年综合大题，按训练目标进入对应题库。',
    sections: [
      { title: '模拟选择题', description: '分课程练习基础概念与判断。', href: '/docs/408/mock/' },
      { title: '408 历年真题', description: '回到原题，熟悉实际命题方式。', href: '/docs/408/past-exams/' },
      { title: '历年大题整理', description: '整理计算、分析与综合应用题。', href: '/docs/408/past-exams-large-questions/' },
    ],
  },
  {
    id: 'english',
    name: '英语阅读',
    shortName: '英语',
    description: '读懂文章，也读懂答案背后的依据。边做边核对自己的理解。',
    href: '/docs/english/',
    icon: 'english',
    topics: ['原文阅读', '即时判分', '答案解析'],
    previewTitle: 'Read. Think. Understand.',
    previewDescription: '从一篇原创模拟文章开始，练习推断、词义判断与主旨概括。',
    sections: [
      { title: '阅读原文', description: '在完整语境中理解段落与论证。', href: '/docs/english/' },
      { title: '完成阅读题', description: '选择答案，立即核对判断结果。', href: '/docs/english/' },
      { title: '查看完整解析', description: '回查原文依据，辨析干扰选项。', href: '/docs/english/' },
    ],
  },
  {
    id: 'politics',
    name: '考研政治',
    shortName: '政治',
    description: '按年份练习，按教材模块复盘，让每道真题回到对应的考点。',
    href: '/docs/politics/',
    icon: 'politics',
    topics: ['历年试卷', '分类真题', '考点复盘'],
    previewTitle: '沿着真题，找到考点。',
    previewDescription: '年份检索与章节分类相互补充，适合整卷练习和专项复习。',
    sections: [
      { title: '历年真题', description: '按考试年份查找试卷与解析。', href: '/docs/politics/historical-questions/' },
      { title: '分类真题', description: '按五个教材模块定位练习。', href: '/docs/politics/classified-questions/' },
      { title: '马克思主义基本原理', description: '从马原专题开始逐章复盘。', href: '/docs/politics/classified-questions/marxism-principles/' },
    ],
  },
  {
    id: 'programming',
    name: '编程与算法',
    shortName: '编程',
    description: '从数组到动态规划，在代码与题解之间建立自己的解题方法。',
    href: '/docs/programming/',
    icon: 'code',
    topics: ['数据结构', '算法练习', '解题复盘'],
    previewTitle: '把思路，写成代码。',
    previewDescription: '围绕经典数据结构与算法题展开训练，从基础概念走向问题求解。',
    sections: [
      { title: '数组理论基础', description: '理解连续存储与基本操作。', href: '/docs/programming/algorithm/programmercarl/s-6bc9a995/001-fabccd09/' },
      { title: '二分查找', description: '从边界条件开始建立解题习惯。', href: '/docs/programming/algorithm/programmercarl/s-6bc9a995/002-41efbdd3/' },
      { title: '动态规划基础', description: '逐步掌握状态定义与递推关系。', href: '/docs/programming/algorithm/programmercarl/s-6bca1adc/001-5cf92db7/' },
    ],
  },
];
