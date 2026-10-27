import type { QuestionType } from './grading';
import { QUESTION_TAG_KINDS, type QuestionTag, type QuestionTags } from './model';

/*
 * Built-in tags (model.ts), one shape per kind. All server-safe and free of
 * state: a page renders a hundred question headers. Looks live in
 * styles/question.css under the data attributes set here.
 *
 *   type     outlined chip with the type's icon and score
 *   source   a concise paper or book name
 *   point    knowledge-point chips with a common icon, shown with the solution
 */

function tagTitle(tag: QuestionTag) {
  return tag.group ? `${tag.group}：${tag.label}` : tag.label;
}

/** The question's type with its icon, and its score. */
export function QuestionTypeTag({ type, label, points }: { type: QuestionType; label: string; points?: number }) {
  return (
    <span data-question-type-label="" data-type={type}>
      {label}
      {points ? <span data-type-points="">{points} 分</span> : null}
    </span>
  );
}

/** One chip per tag of a kind; extra kinds reuse it with their own look. */
export function QuestionTagChips({ tags }: { tags: readonly QuestionTag[] }) {
  return tags.map((tag) => (
    <span key={tag.label} data-question-tag={tag.kind} title={tagTitle(tag)}>
      {tag.label}
    </span>
  ));
}

/**
 * Where the question comes from, as one trail that truncates rather than
 * wraps. Narrow rows fold the middle steps into "…" (styles/question.css).
 */
export function QuestionSourceTrail({ tags }: { tags: readonly QuestionTag[] }) {
  const sources = tags.filter((tag) => !['科目', '章节'].includes(tag.group ?? ''));
  if (sources.length === 0) return null;
  const first = sources[0].label;
  const paper = first === '王道8套卷' && /^第\d+套$/u.test(sources[1]?.label ?? '')
    ? `${first}${sources[1].label}`
    : first.replace(/^(王道·卷[一二三四五六七八]|竟成·模拟[一二三四五六七八])-(?:Q)?\d+$/u, '$1');
  return (
    <span data-source-trail="" title={paper}>
      <span className="sr-only">{QUESTION_TAG_KINDS.source.label}：{paper}</span>
      <span data-trail-step="" data-trail-edge="" aria-hidden="true">{paper}</span>
    </span>
  );
}

/** Knowledge points as a wrapping list of chips. */
export function QuestionPointTags({ tags }: { tags: readonly QuestionTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul data-point-tags="" aria-label={QUESTION_TAG_KINDS.point.label}>
      {tags.map((tag) => (
        <li key={tag.label} data-question-tag="point" title={tagTitle(tag)}>
          {tag.label}
        </li>
      ))}
    </ul>
  );
}

/** The header shows type, score and source. Points wait for the solution. */
export function QuestionHeadTags({ type, typeLabel, points, tags }: {
  type: QuestionType;
  typeLabel: string;
  points?: number;
  tags: QuestionTags;
}) {
  return (
    <>
      <QuestionTypeTag type={type} label={typeLabel} points={points} />
      <QuestionSourceTrail tags={tags.source} />
    </>
  );
}
