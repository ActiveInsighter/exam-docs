import { BookOpenIcon, CircleDotIcon, PenLineIcon, SquareCheckBigIcon, TargetIcon, TextCursorInputIcon } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { QUESTION_TYPE_LABELS, type QuestionType } from './grading';
import { QUESTION_TAG_KINDS, type QuestionTag } from './tags';

/*
 * Built-in tags (tags.ts), one shape per kind. All server-safe and free of
 * state: a page renders a hundred question headers.
 *
 *   type     hairline chip with the type's icon and the score
 *   source   a concise paper or book name behind a book icon
 *   point    knowledge-point chips, shown with the solution
 *
 * All in the card's own neutral ink, so the stem and the graded options
 * carry the only colour.
 */

/** True / false has no Lucide glyph of its own: a tick beside a cross. */
function TrueFalseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M1.5 12.5l3.5 3.5 6-7.5" />
      <path d="M15 8.5l7 7M22 8.5l-7 7" />
    </svg>
  );
}

const TYPE_ICONS: Record<QuestionType, ComponentType<SVGProps<SVGSVGElement>>> = {
  single: CircleDotIcon,
  multiple: SquareCheckBigIcon,
  boolean: TrueFalseIcon,
  blank: TextCursorInputIcon,
  essay: PenLineIcon,
};

/** The question's type with its icon, and its score. */
export function QuestionTypeTag({ type, points, className }: { type: QuestionType; points?: number; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return (
    <span
      data-question-type-label=""
      data-type={type}
      className={cn(
        'inline-flex h-6 items-center gap-1.25 rounded-lg border border-(--exam-line) pr-2.25 pl-1.75 text-xs leading-none font-semibold tracking-wide whitespace-nowrap text-(--exam-type-fg)',
        className,
      )}
    >
      <Icon aria-hidden="true" strokeWidth={2.25} className="size-3.25 shrink-0 opacity-75" />
      {QUESTION_TYPE_LABELS[type]}
      {points ? (
        <span data-type-points="" className="ml-0.5 border-l border-(--exam-line) pl-1.5 font-medium tracking-normal text-muted-foreground tabular-nums">
          {points} 分
        </span>
      ) : null}
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
export function QuestionSourceTrail({ tags, className }: { tags: readonly QuestionTag[]; className?: string }) {
  // Subject and chapter are the page's own place in the sidebar; the header names the paper.
  const sources = tags.filter((tag) => tag.group !== '科目' && tag.group !== '章节');
  if (sources.length === 0) return null;
  const paper = paperName(sources);
  return (
    <span
      data-source-trail=""
      title={paper}
      className={cn('inline-flex h-6 max-w-full min-w-0 items-center gap-1.75 px-0.5 text-[0.8125rem] leading-none whitespace-nowrap', className)}
    >
      <BookOpenIcon aria-hidden="true" strokeWidth={2.1} className="size-3.75 shrink-0 text-(--exam-source-accent)" />
      <span className="sr-only">{QUESTION_TAG_KINDS.source.label}：{paper}</span>
      <span data-trail-step="" aria-hidden="true" className="min-w-[2.5em] truncate font-medium text-foreground/80">{paper}</span>
    </span>
  );
}

/** Knowledge points as a wrapping list of chips. */
export function QuestionPointTags({ tags }: { tags: readonly QuestionTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul data-point-tags="" aria-label={QUESTION_TAG_KINDS.point.label} className="m-0 flex list-none flex-wrap gap-2 p-0">
      {tags.map((tag) => (
        <li
          key={tag.label}
          title={tag.group ? `${tag.group}：${tag.label}` : tag.label}
          className="inline-flex min-h-8 items-center gap-1.75 rounded-xl border border-(--exam-line) py-1.5 pr-3 pl-2.5 text-[0.8125rem] leading-snug font-medium"
        >
          <TargetIcon aria-hidden="true" strokeWidth={2.1} className="size-3.5 shrink-0 text-(--exam-point-accent)" />
          {tag.label}
        </li>
      ))}
    </ul>
  );
}
