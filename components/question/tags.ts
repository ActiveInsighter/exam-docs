/*
 * Built-in question tags (pure; no React).
 *
 *   tags="王道8套卷, 第4套, 计算机网络, 考点:VLAN广播域, 易错"
 *   tags={["来源:2023 统考", "章节:栈与队列", "考点:循环队列"]}
 *
 * Commas (, ， 、) separate tags; "分类:值" names a category. Every tag is
 * filed under one of three kinds:
 *
 *   type     traits of the question itself (易错, 难度:…)
 *   source   where it comes from (book, paper, subject, chapter); bare tags
 *            without a known category land here
 *   point    what it examines (考点:…), shown with the solution only
 *
 * A new kind is a new entry in QUESTION_TAG_KINDS plus its view in
 * question-tags.tsx.
 */

export type QuestionTagKind = 'type' | 'source' | 'point';

export type QuestionTagKindSpec = {
  /** Name of the kind, read out before its tags. */
  label: string;
  /** Categories that file a tag under this kind ("考点:…"). */
  groups: readonly string[];
  /** Bare tags that belong here without a category. */
  keywords?: readonly string[];
};

export const QUESTION_TAG_KINDS: Record<QuestionTagKind, QuestionTagKindSpec> = {
  type: {
    label: '题型',
    groups: ['题型', '难度', '标记', '特点'],
    keywords: ['易错', '重点', '难点', '难题', '压轴', '高频', '必做', '经典', '基础', '拔高'],
  },
  source: { label: '来源', groups: ['来源', '出处', '试卷', '年份', '科目', '章节'] },
  point: { label: '考点', groups: ['考点', '知识点', '考察点'] },
};

/** Where tags without a known category go. */
const DEFAULT_TAG_KIND: QuestionTagKind = 'source';

/** At most this many tags of each kind. */
const QUESTION_TAG_LIMIT = 12;

export type QuestionTag = {
  label: string;
  /** Category before a colon, if any. */
  group?: string;
  kind: QuestionTagKind;
};

export type QuestionTags = Record<QuestionTagKind, QuestionTag[]>;

function splitTagList(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(/[,，、]/u)
      : [];
  return list.map((item) => item.trim()).filter((item) => item !== '');
}

function tagKindOf(label: string, group?: string): QuestionTagKind {
  const kinds = Object.entries(QUESTION_TAG_KINDS) as [QuestionTagKind, QuestionTagKindSpec][];
  const found = group
    ? kinds.find(([, spec]) => spec.groups.includes(group))
    : kinds.find(([, spec]) => spec.keywords?.includes(label));
  return found?.[0] ?? DEFAULT_TAG_KIND;
}

export function parseQuestionTags(value: unknown): QuestionTags {
  const seen = new Set<string>();
  const tags: QuestionTags = { type: [], source: [], point: [] };
  for (const item of splitTagList(value)) {
    const match = /^([^:：]{1,12})[:：]\s*(.+)$/u.exec(item);
    const group = match?.[1].trim();
    const label = (match?.[2] ?? item).trim();
    const kind = tagKindOf(label, group);
    const key = `${kind}\u0000${label}`;
    if (!label || seen.has(key) || tags[kind].length === QUESTION_TAG_LIMIT) continue;
    seen.add(key);
    tags[kind].push({ label, ...(group ? { group } : {}), kind });
  }
  return tags;
}
