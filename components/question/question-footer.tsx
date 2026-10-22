'use client';

import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, RotateCcwIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { blankBadge } from './blank-field';
import type { AttemptResult, BlankSpec, Evaluation, GradingSpec } from './grading';
import { formatKey } from './grading';
import { MathPreview } from './math-preview';
import type { QuestionTag } from './model';
import { useQuestionState } from './question-state';
import { QuestionSolutionSheet } from './solution-sheet';

/** Coarse state published on the footer for page-level navigators. */
export type AttemptStatus = 'idle' | 'draft' | AttemptResult;

const ICONS: Record<AttemptResult, ReactNode> = {
  correct: <CircleCheckIcon aria-hidden="true" />,
  partial: <CircleAlertIcon aria-hidden="true" />,
  incorrect: <CircleXIcon aria-hidden="true" />,
};

/** Words for a result: "少选" for a subset of a multiple answer, "部分正确" for blanks. */
export function describeResult(spec: GradingSpec, evaluation: Evaluation, selected: readonly string[]): string {
  if (evaluation.result === 'correct') return '回答正确';
  if (evaluation.result === 'incorrect') return '回答错误';
  if (spec.kind === 'choice') {
    const missed = spec.key.length - selected.filter((label) => spec.key.includes(label)).length;
    return `少选 · 漏选 ${missed} 项`;
  }
  if (spec.kind === 'blank') {
    const right = evaluation.blanks.filter((verdict) => verdict === 'correct').length;
    return `部分正确 · ${right}/${spec.blanks.length} 空`;
  }
  return '部分正确';
}

export function BlankAnswer({ blank }: { blank: BlankSpec }) {
  return blank.kind === 'math'
    ? <MathPreview text={blank.answer} className="text-[1.05em]" />
    : <span>{blank.answer}</span>;
}

/** The key as shown under a graded question. */
function KeyText({ spec, evaluation }: { spec: GradingSpec; evaluation: Evaluation }) {
  if (spec.kind !== 'blank') return <span className="font-semibold text-foreground">{formatKey(spec)}</span>;
  const several = spec.blanks.length > 1;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 text-foreground">
      {spec.blanks.map((blank, index) => evaluation.blanks[index] === 'correct' && several ? null : (
        <span key={index} className="inline-flex items-baseline gap-1">
          {several ? <span className="text-muted-foreground">{blankBadge(index)}</span> : null}
          <span className="font-semibold"><BlankAnswer blank={blank} /></span>
        </span>
      ))}
    </span>
  );
}

function SubmitHint() {
  const question = useQuestionState()!;
  const { spec, selected } = question;
  if (spec.kind === 'blank') {
    const math = spec.blanks.some((blank) => blank.kind === 'math');
    const several = spec.blanks.length > 1;
    return <>{several ? '回车跳到下一空' : '回车提交'}{math ? ' · 数学空可用屏幕键盘输入' : ''}</>;
  }
  return <>{selected.length ? `已选 ${selected.length} 项` : '可多选，选出全部正确项后提交'}</>;
}

/** Left side of the footer: submit step while answering, the grade afterwards. */
function AttemptView() {
  const question = useQuestionState();
  if (!question) return null;
  const { spec, submitted, evaluation, attempt, canSubmit, submit, selected } = question;
  const needsSubmit = spec.kind === 'blank' || (spec.kind === 'choice' && spec.multiple);

  if (!submitted || !evaluation) {
    if (!needsSubmit) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="sm" disabled={!canSubmit} onClick={submit} className="h-8 rounded-full px-4">
          提交答案
        </Button>
        <span className="text-[0.8125rem] text-muted-foreground"><SubmitHint /></span>
      </div>
    );
  }

  const invalid = evaluation.blanks.flatMap((verdict, index) => (verdict === 'invalid' ? [index] : []));
  return (
    <div key={attempt} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span data-result-pill={evaluation.result}>
        {ICONS[evaluation.result]}
        {describeResult(spec, evaluation, selected)}
      </span>
      {evaluation.result !== 'correct' ? (
        <span data-result-key="">
          正确答案 <KeyText spec={spec} evaluation={evaluation} />
        </span>
      ) : null}
      {invalid.length ? (
        <span className="text-[0.8125rem] text-muted-foreground">
          {invalid.map((index) => blankBadge(index)).join('')} 无法识别为数学表达式
        </span>
      ) : null}
    </div>
  );
}

function useAttemptStatus(): AttemptStatus | undefined {
  const question = useQuestionState();
  if (!question) return undefined;
  if (question.submitted && question.evaluation) return question.evaluation.result;
  return question.answered ? 'draft' : 'idle';
}

export type QuestionFooterProps = {
  questionId: string;
  solution: ReactNode;
  showSolution: boolean;
  buttonLabel: string;
  dialogTitle: string;
  numberLabel: string | null;
  typeLabel: string;
  tags: QuestionTag[];
};

export function QuestionFooter({ showSolution, ...sheet }: QuestionFooterProps) {
  const state = useQuestionState();
  const status = useAttemptStatus();
  return (
    <div data-question-footer="" data-attempt-result={status}>
      <div role="status" aria-live="polite" data-footer-status="">
        <AttemptView />
        {state?.storageError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-destructive">{state.storageError}</p>
            <Button variant="outline" size="sm" onClick={state.retryStorage}>重试保存</Button>
          </div>
        ) : null}
      </div>
      {/* Redo sits with 查看解答 so the grade line stays one unit when the footer wraps. */}
      <div data-footer-actions="">
        {state?.submitted && state.evaluation ? (
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground" onClick={state.reset}>
            <RotateCcwIcon data-icon="inline-start" />
            重做
          </Button>
        ) : null}
        {showSolution ? <QuestionSolutionSheet {...sheet} /> : null}
      </div>
    </div>
  );
}
