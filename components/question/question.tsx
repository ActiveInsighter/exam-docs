import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChoiceGroup } from './choice-group';
import { getChoiceDensity } from './choice-layout';
import { QUESTION_TYPES, QUESTION_TYPE_LABELS, type QuestionType } from './grading';
import { QuestionMarkActions, QuestionMarksProvider, QuestionNote, QuestionUserTags } from './marks/question-marks';
import {
  buildGradingSpec,
  hasContent,
  indexBlanks,
  parseQuestionTags,
  questionStemClassName,
  splitQuestion,
  toChoiceOptions,
} from './model';
import { QuestionFooter } from './question-footer';
import { QuestionProvider } from './question-state';
import { BuiltinTags } from './question-tags';
import { TrueFalse } from './true-false';

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
   * Built-in tags shown as capsules in the card's top-left corner:
   * tags="2023 统考, 数据结构" or tags={["来源:2023 统考", "易错"]}.
   */
  tags?: string | readonly string[];
  /** Display number resolved by remarkQuestion (document order). */
  index?: number | string;
  /** Content hash of the question, added by remarkQuestion at compile time. */
  revision?: string;
  buttonLabel?: string;
  dialogTitle?: string;
  children?: ReactNode;
};

function displayNumber(number: QuestionProps['number'], index: QuestionProps['index']): string | null {
  const label = number === false ? null : (number ?? index);
  if (label === null || label === undefined || label === '') return null;
  const numeric = typeof label === 'string' ? Number(label) : label;
  return typeof numeric === 'number' && Number.isFinite(numeric) ? String(numeric) : String(label);
}

/**
 * One exercise, rendered as a card:
 *
 *   header   number · type · built-in tags · the reader's tags   ☆ tags note
 *   stem     MDX with options / true-false buttons / blanks in place
 *   footer   submit · grade · 查看解答
 *   note     the reader's note, if any
 *
 * `type` decides the interaction: single / multiple / boolean / blank are
 * graded in place, essay opens the reference solution only. Answers are read
 * from <Option correct>, <Blank answer> and `answer`, never from prose.
 */
export function Question({
  id,
  type,
  answer,
  number,
  tags,
  index,
  revision,
  children,
  buttonLabel = '查看解答',
  dialogTitle = '题目与解析',
}: QuestionProps) {
  const questionType = QUESTION_TYPES.includes(type) ? type : 'essay';
  const split = splitQuestion(children);
  const blanks = indexBlanks(split.stem);
  const spec = buildGradingSpec({ type: questionType, answer, options: split.options, blanks: blanks.blanks });

  const options = toChoiceOptions(split.options);
  const answerControl = questionType === 'boolean'
    ? <TrueFalse key="question-boolean" />
    : options.length > 0
      ? <ChoiceGroup key="question-choices" options={options} density={getChoiceDensity(options.map((option) => option.content))} />
      : null;

  let stem = blanks.stem.map((node, position) => (position === split.optionSlot ? answerControl : node));
  if (split.optionSlot === -1 && answerControl) stem = [...stem, answerControl];

  const numberLabel = displayNumber(number, index);
  const builtinTags = parseQuestionTags(tags);
  const solution = split.solution?.props.children;
  const hasSolution = hasContent(solution);
  const typeLabel = QUESTION_TYPE_LABELS[questionType];

  const card = (
    <QuestionMarksProvider questionId={id}>
      <section
        id={`question-${id}`}
        data-exam-question=""
        data-question-id={id}
        data-question-type={questionType}
        data-question-revision={revision}
        aria-labelledby={numberLabel ? `question-${id}-label` : undefined}
        className="min-w-0 scroll-mt-4"
      >
        <div data-question-header="">
          <div data-question-meta="">
            {numberLabel ? (
              <span id={`question-${id}-label`} data-question-number="" aria-label={`第 ${numberLabel} 题`}>{numberLabel}</span>
            ) : null}
            <span data-question-type-label="">{typeLabel}</span>
            <BuiltinTags tags={builtinTags} />
            <QuestionUserTags />
          </div>
          <QuestionMarkActions />
        </div>
        <div data-exam-question-body="" className={cn('min-w-0', questionStemClassName)}>
          {stem}
        </div>
        {hasSolution || spec ? (
          <QuestionFooter
            questionId={id}
            solution={solution}
            showSolution={hasSolution}
            buttonLabel={buttonLabel}
            dialogTitle={dialogTitle}
            numberLabel={numberLabel}
            typeLabel={typeLabel}
            tags={builtinTags}
          />
        ) : null}
        <QuestionNote />
      </section>
    </QuestionMarksProvider>
  );

  return spec
    ? <QuestionProvider key={`${id}:${revision}`} spec={spec} questionId={id} questionRevision={revision}>{card}</QuestionProvider>
    : card;
}
