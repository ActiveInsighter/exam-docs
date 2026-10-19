import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { ExamChoices } from './choices';
import {
  getChoiceOptionNodes,
  getOptionLabels,
  hasContent,
  parseAnswerKey,
  splitExamSolution,
  type ExamContentProps,
} from './parts';
import { ExamQuestionFooter } from './question-footer';
import { ExamQuestionProvider } from './question-state';

type ExamQuestionProps = {
  children?: ReactNode;
  buttonLabel?: string;
  dialogTitle?: string;
};

/**
 * Marks the solution part of an <ExamQuestion>. Its content stays ordinary
 * MDX (math, lists, tables, code) compiled by Fumadocs.
 */
export function ExamSolution({ children }: ExamContentProps) {
  return <>{children}</>;
}

function isExamSolution(node: ReactNode): node is ReactElement<ExamContentProps> {
  return isValidElement(node) && node.type === ExamSolution;
}

function collectChoiceGroups(node: ReactNode, found: ReactElement<ExamContentProps>[] = []) {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ExamContentProps>(child)) continue;
    if (child.type === ExamChoices) found.push(child);
    else collectChoiceGroups(child.props.children, found);
  }
  return found;
}

/**
 * Only a question with exactly one choice group whose letters cover the parsed
 * answer is graded; anything ambiguous stays a plain question.
 */
function getGradableKey(question: ReactNode[], answer: ReactNode | null) {
  const key = hasContent(answer) ? parseAnswerKey(answer) : null;
  if (!key) return null;

  const groups = collectChoiceGroups(question);
  if (groups.length !== 1) return null;

  const labels = getOptionLabels(getChoiceOptionNodes(groups[0].props.children));
  return key.every((letter) => labels.includes(letter)) ? key : null;
}

/**
 * MDX wrapper for an exercise:
 *
 * <ExamQuestion>
 *
 * 1. Question as normal MDX…
 *
 * <ExamChoices>
 * <ExamOption>A. …</ExamOption>
 * </ExamChoices>
 *
 * <ExamSolution>
 *   <ExamAnswer>A</ExamAnswer>
 *   <ExamExplanation>…</ExamExplanation>
 * </ExamSolution>
 *
 * </ExamQuestion>
 *
 * Everything except <ExamSolution> stays in the normal document flow. Choice
 * questions whose answer is a set of option letters become clickable.
 */
export function ExamQuestion({
  children,
  buttonLabel = '查看解答',
  dialogTitle = '题目与解析',
}: ExamQuestionProps) {
  const nodes = Children.toArray(children);
  const solution = nodes.find(isExamSolution);
  const question = nodes.filter((node) => !isExamSolution(node));

  // Fail soft while a document is being migrated: keep all content visible.
  if (!solution) {
    return (
      <section data-exam-question="" className="min-w-0 @container">
        {children}
      </section>
    );
  }

  const { answer, explanation } = splitExamSolution(solution.props.children);
  const answerValue = hasContent(answer) ? answer : null;

  return (
    <ExamQuestionProvider answerKey={getGradableKey(question, answerValue)}>
      <section data-exam-question="" className="min-w-0 @container">
        <div
          data-exam-question-body=""
          className="min-w-0 [&>:first-child]:mt-0! [&>:last-child]:mb-0!"
        >
          {question}
        </div>
        <ExamQuestionFooter
          question={question}
          answer={answerValue}
          explanation={explanation}
          buttonLabel={buttonLabel}
          dialogTitle={dialogTitle}
        />
        <Separator className="mt-3" />
      </section>
    </ExamQuestionProvider>
  );
}
