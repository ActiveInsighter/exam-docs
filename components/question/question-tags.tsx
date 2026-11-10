import { QUESTION_TYPE_LABELS, type QuestionType } from './grading';
import { QUESTION_TAG_KINDS, type QuestionTag } from './tags';

/*
 * Built-in tags (tags.ts), one shape per kind. All server-safe and free of
 * state: a page renders a hundred question headers. Looks live in
 * styles/question/card.css under the data attributes set here.
 *
 *   type     hairline chip with the type's icon and the score
 *   source   a concise paper or book name behind a book icon
 *   point    knowledge-point chips, shown with the solution
 */

/** The question's type with its icon, and its score. */
export function QuestionTypeTag({ type, points }: { type: QuestionType; points?: number }) {
  return (
    <span data-question-type-label="" data-type={type}>
      {QUESTION_TYPE_LABELS[type]}
      {points ? <span data-type-points="">{points} 分</span> : null}
    </span>
  );
}

/** Legacy imports name the question in the source ("王道·卷一-Q01") or split it over two tags. */
function paperName(tags: readonly QuestionTag[]) {
  const [first, second] = tags;
  if (first.label === '王道8套卷' && /^第\d+套$/u.test(second?.label ?? '')) return first.label + second.label;
  return first.label.replace(/^(王道·卷[一二三四五六七八]|竟成·模拟[一二三四五六七八])-(?:Q)?\d+$/u, '$1');
}

/** Where the question comes from: one name that truncates rather than wraps. */
export function QuestionSourceTrail({ tags }: { tags: readonly QuestionTag[] }) {
  // Subject and chapter are the page's own place in the sidebar; the header names the paper.
  const sources = tags.filter((tag) => tag.group !== '科目' && tag.group !== '章节');
  if (sources.length === 0) return null;
  const paper = paperName(sources);
  return (
    <span data-source-trail="" title={paper}>
      <span className="sr-only">{QUESTION_TAG_KINDS.source.label}：{paper}</span>
      <span data-trail-step="" aria-hidden="true">{paper}</span>
    </span>
  );
}

/** Knowledge points as a wrapping list of chips. */
export function QuestionPointTags({ tags }: { tags: readonly QuestionTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul data-point-tags="" aria-label={QUESTION_TAG_KINDS.point.label}>
      {tags.map((tag) => (
        <li key={tag.label} data-question-tag="point" title={tag.group ? `${tag.group}：${tag.label}` : tag.label}>
          {tag.label}
        </li>
      ))}
    </ul>
  );
}
