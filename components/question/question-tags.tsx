import { Fragment } from 'react';
import type { QuestionType } from './grading';
import { QUESTION_TAG_KINDS, type QuestionTag, type QuestionTags } from './model';

/*
 * Built-in tags (model.ts), one shape per kind. All server-safe and free of
 * state: a page renders a hundred question headers. Looks live in
 * styles/question.css under the data attributes set here.
 *
 *   type     outlined chip with the type's icon, the score, then traits
 *   source   one trail, book › paper › subject › chapter, truncating
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
  if (tags.length === 0) return null;
  const path = tags.map((tag) => tag.label).join(' › ');
  return (
    <span data-source-trail="" title={path}>
      <span className="sr-only">{QUESTION_TAG_KINDS.source.label}：{path}</span>
      {tags.map((tag, index) => (
        <Fragment key={tag.label}>
          {/* Stands in for the folded middle steps; hidden until a row is narrow. */}
          {index === 1 && tags.length > 2 ? <span data-trail-step="" data-trail-more="" aria-hidden="true">…</span> : null}
          <span data-trail-step="" data-trail-edge={index === 0 || index === tags.length - 1 ? '' : undefined} aria-hidden="true">
            {tag.label}
          </span>
        </Fragment>
      ))}
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

/** What a question header shows: type, score and traits, then the source. Points wait for the solution. */
export function QuestionHeadTags({ type, typeLabel, points, tags }: {
  type: QuestionType;
  typeLabel: string;
  points?: number;
  tags: QuestionTags;
}) {
  return (
    <>
      <QuestionTypeTag type={type} label={typeLabel} points={points} />
      <QuestionTagChips tags={tags.type} />
      <QuestionSourceTrail tags={tags.source} />
    </>
  );
}
