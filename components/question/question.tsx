import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { ChoiceGroup } from './choice-group';
import { getChoiceDensity } from './choice-layout';
import { QUESTION_TYPES, getOptionLetter, type QuestionType } from './grading';
import {
  buildChoiceModel,
  hasContent,
  indexBlanks,
  splitQuestion,
  type ChoiceOptionModel,
} from './model';
import { QuestionFooter } from './question-footer';
import { QuestionProvider, type GradingSpec } from './question-state';

export type QuestionProps = {
  /** Stable identifier of the question; never derived from its position. */
  id: string;
  type: QuestionType;
  /** Key of a `boolean` question: true = 正确, false = 错误. */
  answer?: boolean;
  points?: number;
  /** Overrides the automatic number; `false` hides it. */
  number?: number | string | false;
  /** Display number resolved by remarkQuestion (document order). */
  index?: number | string;
  /** Content hash of the question, added by remarkQuestion at compile time. */
  revision?: string;
  buttonLabel?: string;
  dialogTitle?: string;
  children?: ReactNode;
};

function parseNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function formatAnswer(spec: GradingSpec): ReactNode {
  if (spec.kind === 'choice') return spec.keyText ?? spec.key.join('');
  return spec.blanks.map((blank) => blank.answer).join('；');
}

/** Puts the number in front of the first line of the stem. */
function withNumber(stem: ReactNode[], label: string): ReactNode[] {
  const mark = (
    <span
      key="question-number"
      data-question-number=""
      className="mr-2 font-medium tabular-nums text-muted-foreground"
    >
      {label}
    </span>
  );
  const first = stem[0];
  if (isValidElement<{ children?: ReactNode }>(first) && first.type === 'p') {
    return [
      cloneElement(first, undefined, mark, ...Children.toArray(first.props.children)),
      ...stem.slice(1),
    ];
  }
  return [<p key="question-number-line">{mark}</p>, ...stem];
}

/**
 * One exercise.
 *
 * <Question id="q001" type="single">
 *   Stem as normal MDX…
 *
 *   <Option>wrong</Option>
 *   <Option correct>right</Option>
 *
 *   <Solution>…</Solution>
 * </Question>
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
  index,
  revision,
  children,
  buttonLabel = '查看解答',
  dialogTitle = '题目与解析',
}: QuestionProps) {
  const split = splitQuestion(children);
  const questionType = QUESTION_TYPES.includes(type) ? type : 'essay';

  // Stem, with blanks numbered and (for blank questions) the answer specs.
  const blanks = indexBlanks(split.stem);
  const model = buildChoiceModel({ type: questionType, answer, options: split.options });
  const spec: GradingSpec | null =
    model.kind === 'choice'
      ? { kind: 'choice', multiple: model.multiple, key: model.key, keyText: model.keyText }
      : questionType === 'blank' && blanks.blanks.length > 0
        ? { kind: 'blank', blanks: blanks.blanks }
        : null;

  // Options are always shown; they only become clickable with a valid key.
  const optionItems: ChoiceOptionModel[] =
    model.kind === 'choice'
      ? model.options
      : split.options.map((option, position) => ({
          label: getOptionLetter(position),
          content: option.props.children,
          correct: false,
        }));
  const showOptions = optionItems.length > 0 || questionType === 'boolean';
  const choiceNode = showOptions ? (
    <ChoiceGroup
      key="question-choices"
      options={optionItems}
      density={getChoiceDensity(optionItems.map((option) => option.content))}
    />
  ) : null;

  let stem = blanks.stem.map((node, position) =>
    position === split.optionSlot ? choiceNode : node,
  );
  if (split.optionSlot === -1 && choiceNode) stem = [...stem, choiceNode];

  const label = number === false ? null : (number ?? index);
  const parsedNumber = parseNumber(label);
  const displayNumber =
    parsedNumber !== null ? `${parsedNumber}.` : typeof label === 'string' ? label : null;
  const numberedStem = displayNumber ? withNumber(stem, displayNumber) : stem;

  const solution = split.solution?.props.children;
  const hasSolution = hasContent(solution);
  const shortAnswer = spec ? formatAnswer(spec) : null;

  const section = (
    <section
      data-exam-question=""
      data-question-id={id}
      data-question-type={questionType}
      data-question-revision={revision}
      className="min-w-0 @container"
    >
      <div
        data-exam-question-body=""
        className="min-w-0 [&>:first-child]:mt-0! [&>:last-child]:mb-0!"
      >
        {numberedStem}
      </div>
      {hasSolution ? (
        <QuestionFooter
          question={stem}
          answer={shortAnswer}
          solution={solution}
          solutionLabel={shortAnswer ? '解析' : '解答'}
          buttonLabel={buttonLabel}
          dialogTitle={dialogTitle}
        />
      ) : null}
      <Separator className="mt-3" />
    </section>
  );

  return spec ? <QuestionProvider spec={spec}>{section}</QuestionProvider> : section;
}

