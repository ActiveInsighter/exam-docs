import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getChoiceDensity } from './choice-layout';
import { QUESTION_TYPES, type QuestionType } from './grading';
import { QuestionMarkActions, QuestionMarksProvider, QuestionNote, QuestionUserTags } from './marks/question-marks';
import { buildGradingSpec, hasContent, indexBlanks, questionStemClassName, splitQuestion, toChoiceOptions, type QuestionMeta } from './model';
import { ChoiceGroup, TrueFalse } from './options';
import { QuestionFooter } from './question-footer';
import { QuestionProvider } from './question-state';
import { QuestionSourceTrail, QuestionTypeTag } from './question-tags';
import { parseQuestionTags } from './tags';

export type QuestionProps = {
  /** Stable identifier of the question; never derived from its position. */
  id: string;
  type: QuestionType;
  /** Key of a `boolean` question: true = 正确, false = 错误. */
  answer?: boolean;
  points?: number;
  /** Overrides the automatic number; `false` hides it. */
  number?: number | string | false;
  /**
   * Built-in tags, sorted into type traits, source and knowledge points
   * (tags.ts): tags="王道8套卷, 第4套, 考点:VLAN, 易错". The header shows the
   * type and score plus the source; knowledge points appear with the solution.
   */
  tags?: string | readonly string[];
  /** Display number resolved by remarkQuestion (document order). */
  index?: number | string;
  /** Content hash of the question, added by remarkQuestion at compile time. */
  revision?: string;
  children?: ReactNode;
};

function displayNumber(number: QuestionProps['number'], index: QuestionProps['index']): string | null {
  const label = number === false ? null : (number ?? index);
  if (label === null || label === undefined || label === '') return null;
  const numeric = Number(label);
  return Number.isFinite(numeric) ? String(numeric) : String(label);
}

/**
 * One exercise, rendered as a card:
 *
 *   header   number · type, score · the reader's tags · source      ☆ tags note
 *   stem     MDX with options / true-false buttons / blanks in place
 *   footer   submit · grade · 查看解答
 *   note     the reader's note, if any
 *
 * `type` decides the interaction: single / multiple / boolean / blank are
 * graded in place, an essay is graded by the reader against its solution.
 * Answers are read from <Option correct>, <Blank answer> and `answer`, never
 * from prose.
 */
export function Question({ id, type, answer, points, number, tags, index, revision, children }: QuestionProps) {
  const questionType = QUESTION_TYPES.includes(type) ? type : 'essay';
  const split = splitQuestion(children);
  const blanks = indexBlanks(split.stem);
  const spec = buildGradingSpec({ type: questionType, answer, options: split.options, blanks: blanks.blanks });
  const solution = split.solution?.props.children;
  const meta: QuestionMeta = {
    id,
    type: questionType,
    number: displayNumber(number, index),
    points: typeof points === 'number' && Number.isFinite(points) && points > 0 ? points : undefined,
    tags: parseQuestionTags(tags),
  };

  // The answer control takes the place of the options; a true / false question has none, so it follows the stem.
  const options = toChoiceOptions(split.options);
  const control = questionType === 'boolean'
    ? <TrueFalse key="question-answer" />
    : options.length > 0
      ? <ChoiceGroup key="question-answer" options={options} density={getChoiceDensity(options.map((option) => option.content))} />
      : null;
  const stem = blanks.stem.map((node, position) => (position === split.optionSlot ? control : node));
  if (split.optionSlot === -1 && control) stem.push(control);

  const card = (
    <QuestionMarksProvider questionId={id}>
      <section
        id={`question-${id}`}
        data-exam-question=""
        data-question-id={id}
        data-question-type={questionType}
        data-question-revision={revision}
        aria-labelledby={meta.number ? `question-${id}-label` : undefined}
        className="min-w-0 scroll-mt-4"
      >
        <div data-question-header="">
          <div data-question-meta="">
            {meta.number ? (
              <span id={`question-${id}-label`} data-question-number="" aria-label={`第 ${meta.number} 题`}>{meta.number}</span>
            ) : null}
            <QuestionTypeTag type={questionType} points={meta.points} />
            <QuestionUserTags />
          </div>
          <QuestionSourceTrail tags={meta.tags.source} />
          <QuestionMarkActions />
        </div>
        <div data-exam-question-body="" className={cn('min-w-0', questionStemClassName)}>
          {stem}
        </div>
        {hasContent(solution) || spec ? <QuestionFooter meta={meta} solution={hasContent(solution) ? solution : null} /> : null}
        <QuestionNote />
      </section>
    </QuestionMarksProvider>
  );

  return spec
    ? <QuestionProvider key={`${id}:${revision}`} spec={spec} questionId={id} questionRevision={revision}>{card}</QuestionProvider>
    : card;
}
