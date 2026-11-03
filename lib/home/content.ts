/*
 * Editorial content of the home page: copy and references that a person
 * chooses. Everything countable (modules, collections, question totals) is
 * derived from the documentation source in `catalog.server.ts` instead, so the
 * home page never drifts from the content.
 */

/** Initial-exam schedule used by the admission-ticket countdown. */
export const examSchedule = {
  title: '2027 年全国硕士研究生招生考试',
  startsAt: '2026-12-19T08:30:00+08:00',
  dateLabel: '2026 年 12 月 19 日',
  timeLabel: '08:30',
  note: '按 2026 年 12 月 19 日 08:30（北京时间）估算，具体考试安排以官方公告为准。',
} as const;

/** Printed as the 考生须知 list on the admission ticket. */
export const examNotices = [
  '把今天的一点弄懂，就是向前走了一步。',
  '先完成眼前这一题，再慢慢走向下一个目标。',
  '复习不必每天完美，愿你每天都有一点收获。',
  '累了就休息一下，回来再继续也来得及。',
  '把错题变成理解，把理解留给下一次尝试。',
] as const;

/**
 * Real questions shown on the hero answer sheet. Stem, options and the correct
 * answer are read from the MDX file at build time (see catalog.server.ts);
 * only the label, source line and one-sentence takeaway are written here.
 * `tests/home-content.test.ts` checks every reference still resolves.
 */
export interface FeaturedQuestionRef {
  /** Short subject name on the subject switch. */
  subject: string;
  /** Where the question comes from, shown above the stem. */
  source: string;
  /** MDX file relative to content/docs. */
  file: string;
  /** The `<Question id>` inside that file. */
  id: string;
  /** One-sentence reason shown after grading. `$…$` is rendered with KaTeX. */
  takeaway: string;
}

export const featuredQuestions: readonly FeaturedQuestionRef[] = [
  {
    subject: '数学',
    source: '1993 年数学二',
    file: 'math/past-exams/01-高数分类真题0930/01-模块一-函数、极限与连续/02-第二节-极限的基本性质.mdx',
    id: 'math-a92951-003',
    takeaway:
      '令 $t=1/x$，原式化为 $t^2\\sin t$：沿不同点列分别趋于 $+\\infty$ 与 $-\\infty$，所以无界，却不是无穷大。',
  },
  {
    subject: '408',
    source: '2009 年 408 统考',
    file: '408/past-exams/01-数据结构/03-栈、队列和数组.mdx',
    id: '408-db1ecd-001',
    takeaway: '出队顺序就是出栈顺序。按 b、d、c、f、e、a、g 模拟，栈内最多同时有 3 个元素。',
  },
  {
    subject: '政治',
    source: '2024 年政治真题',
    file: 'politics/historical-questions/2024.mdx',
    id: 'politics-862dda-008',
    takeaway: '粮食安全的根本是产能：耕地保护和农业科技直接决定产量，其余三项是配套机制。',
  },
];

/** One bubble in the question-bank strip stands for this many questions. */
export const BANK_BUBBLE_UNIT = 100;
