import type { QuestionTag } from './model';

/** Built-in tags from the MDX `tags` prop: coloured capsules, category in a lighter weight. */
export function BuiltinTags({ tags }: { tags: readonly QuestionTag[] }) {
  return tags.map((tag) => (
    <span
      key={`${tag.group ?? ''}:${tag.label}`}
      data-question-tag=""
      data-tone={tag.tone}
      title={tag.group ? `${tag.group}：${tag.label}` : tag.label}
    >
      {tag.group ? <span data-tag-group="">{tag.group}</span> : null}
      <span>{tag.label}</span>
    </span>
  ));
}
