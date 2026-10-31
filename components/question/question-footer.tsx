'use client';

import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, ClockIcon, GavelIcon, RotateCcwIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ManualGradePanel } from './blank-grade';
import { Button } from '@/components/ui/button';
import { blankBadge } from './blank-field';
import type { AttemptResult, BlankSpec, Evaluation, GradingSpec, QuestionType } from './grading';
import { formatKey, selfGradeOf } from './grading';
import { MathPreview } from './math-preview';
import type { QuestionTags } from './model';
import { useQuestionState } from './question-state';
import { SelfGrade } from './self-grade';
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
  if (spec.kind === 'self') return `自评 · ${selfGradeOf(selected[0])?.label ?? '错误'}`;
  const words = describeGrade(spec, evaluation, selected);
  return evaluation.manual?.some(Boolean) ? `${words} · 已改判` : words;
}

function describeGrade(spec: GradingSpec, evaluation: Evaluation, selected: readonly string[]): string {
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
  if (spec.kind !== 'blank') {
    return <span className="font-semibold text-foreground" data-choice-letters={spec.kind === 'choice' ? '' : undefined}>{formatKey(spec)}</span>;
  }
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
  const { spec, submitted, evaluation, attempt, canSubmit, submit, selected, deferred, answered } = question;
  const needsSubmit = spec.kind === 'blank' || (spec.kind === 'choice' && spec.multiple);

  if (spec.kind === 'self' && (!submitted || !evaluation)) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[0.8125rem] text-muted-foreground">对照解答自评</span>
        <SelfGrade />
      </div>
    );
  }

  if (!submitted || !evaluation) {
    if (deferred) {
      return answered ? (
        <span data-deferred-note="" className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <ClockIcon aria-hidden="true" className="size-3.5" />
          已作答，整篇提交时判分
        </span>
      ) : null;
    }
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
      {evaluation.result !== 'correct' && spec.kind !== 'self' ? (
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
  questionType: QuestionType;
  solution: ReactNode;
  showSolution: boolean;
  buttonLabel: string;
  dialogTitle: string;
  numberLabel: string | null;
  typeLabel: string;
  points?: number;
  tags: QuestionTags;
};

export function QuestionFooter({ showSolution, ...sheet }: QuestionFooterProps) {
  const state = useQuestionState();
  const status = useAttemptStatus();
  const [grading, setGrading] = useState(false);
  const gradable = state?.spec.kind === 'blank' && state.submitted && !!state.evaluation;
  // Closed again once the answer is reset.
  if (grading && !gradable) setGrading(false);
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
        {gradable ? (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={grading}
            data-pressed={grading ? '' : undefined}
            className="h-8 gap-1.5 rounded-full px-3 text-[0.8125rem] text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground has-data-[icon=inline-start]:pl-2.5 data-pressed:bg-(--ui-fill) data-pressed:text-foreground"
            onClick={() => setGrading(!grading)}
          >
            <GavelIcon data-icon="inline-start" />
            手动判分
          </Button>
        ) : null}
        {state?.submitted && state.evaluation ? (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-[0.8125rem] text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground has-data-[icon=inline-start]:pl-2.5" onClick={state.reset}>
            <RotateCcwIcon data-icon="inline-start" />
            {state.spec.kind === 'self' ? '重新自评' : '重做'}
          </Button>
        ) : null}
        {showSolution ? <QuestionSolutionSheet {...sheet} /> : null}
      </div>
      {gradable && grading ? <ManualGradePanel question={state} /> : null}
    </div>
  );
}
