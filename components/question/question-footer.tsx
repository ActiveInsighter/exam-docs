'use client';

import { ClockIcon, GavelIcon, ListChecksIcon, RotateCcwIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { blankBadge } from './blank-field';
import { BlankGradePanel, BlankKey } from './blank-grade';
import { describeResult, formatKey } from './grading';
import type { QuestionMeta } from './model';
import { type QuestionState, useQuestionState } from './question-state';
import { RESULT_ICONS, SelfGrade } from './self-grade';
import { QuestionSolutionSheet } from './solution-sheet';

/*
 * The footer of a card: on the left what the reader does next (submit) or
 * how they did (the grade and, when wrong, the key); on the right 重做 and
 * 查看解答. Under them, for blanks, the panel for grading by hand
 * (blank-grade.tsx). The footer also publishes the question's coarse state
 * in data-attempt-result for page-level navigators (page-questions.ts).
 */

const quiet = 'h-8 gap-1.5 rounded-full px-3 text-[0.8125rem] text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground has-data-[icon=inline-start]:pl-2.5 aria-expanded:bg-(--ui-fill-active) aria-expanded:text-foreground';
const hint = 'text-[0.8125rem] text-muted-foreground';
const row = 'flex flex-wrap items-center gap-x-3 gap-y-2';

function QuietButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button variant="ghost" size="sm" className={cn(quiet, className)} {...props} />;
}

/** The key under a wrong answer; of several blanks only the ones missed. */
function Key({ question }: { question: QuestionState }) {
  const { spec, evaluation } = question;
  if (spec.kind !== 'blank') {
    return <span data-choice-letters={spec.kind === 'choice' ? '' : undefined}>{formatKey(spec)}</span>;
  }
  const several = spec.blanks.length > 1;
  return spec.blanks.map((blank, index) => (several && evaluation?.blanks[index] === 'correct' ? null : (
    <span key={index}>
      {several ? <small>{blankBadge(index)}</small> : null}
      <BlankKey blank={blank} />
    </span>
  )));
}

/** How the reader did: the grade, the key when it was missed, and blanks the checker could not read. */
function Grade({ question }: { question: QuestionState }) {
  const { spec, selected } = question;
  const evaluation = question.evaluation!;
  const unreadable = evaluation.blanks.flatMap((verdict, index) => (verdict === 'invalid' ? [blankBadge(index)] : []));
  return (
    // Keyed by attempt, so the pill's entrance replays on every submission.
    <div key={question.attempt} className={row}>
      <span data-result-pill="" data-tone={evaluation.result}>
        {RESULT_ICONS[evaluation.result]}
        {describeResult(spec, evaluation, selected)}
      </span>
      {evaluation.result !== 'correct' && spec.kind !== 'self' ? (
        <span data-result-key="">正确答案 <Key question={question} /></span>
      ) : null}
      {unreadable.length ? <span className={hint}>{unreadable.join('')} 无法识别为数学表达式</span> : null}
    </div>
  );
}

/** What the reader does next: grade an essay, or submit several picks or blanks. */
function Answering({ question, grading, onGrading }: { question: QuestionState; grading: boolean; onGrading?: () => void }) {
  const { spec, selected } = question;
  if (spec.kind === 'self') {
    return (
      <div className={row}>
        <span className={hint}>对照解答自评</span>
        <SelfGrade />
      </div>
    );
  }
  if (question.deferred) {
    return question.status === 'draft' ? (
      <span data-deferred-note="" className={cn(hint, 'inline-flex items-center gap-1.5')}>
        <ClockIcon aria-hidden="true" className="size-3.5" />
        已作答，整篇提交时判分
      </span>
    ) : null;
  }
  // A single answer is graded on the click itself: nothing to submit.
  if (spec.kind === 'boolean' || (spec.kind === 'choice' && !spec.multiple)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={!question.ready || question.status !== 'draft'}
        onClick={question.submit}
        data-submit-answer=""
        className="h-8 rounded-full px-4"
      >
        提交答案
      </Button>
      {onGrading ? (
        // Formulas can be awkward to type: grade against the key instead, like an essay.
        <QuietButton aria-expanded={grading} onClick={onGrading} data-self-grade-toggle="">
          <ListChecksIcon data-icon="inline-start" />
          对答案自评
        </QuietButton>
      ) : null}
      <span data-submit-hint="" className={hint}>
        {spec.kind === 'choice'
          ? (selected.length ? `已选 ${selected.length} 项` : '可多选，选出全部正确项后提交')
          : `${spec.blanks.length > 1 ? '回车跳到下一空' : '回车提交'}${spec.blanks.some((blank) => blank.kind === 'math') ? ' · 数学空可用屏幕键盘输入' : ''}`}
      </span>
    </div>
  );
}

/**
 * Mounts its content when first opened and eases its height both ways
 * (styles/question/footer.css); closed, the content is inert and, once the
 * motion has ended, unmounted again.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <div
      data-collapse=""
      data-expanded={open ? '' : undefined}
      inert={!open}
      onTransitionEnd={(event) => { if (!open && event.target === event.currentTarget) setMounted(false); }}
    >
      <div>{children}</div>
    </div>
  );
}

export function QuestionFooter({ meta, solution }: { meta: QuestionMeta; solution: ReactNode | null }) {
  const question = useQuestionState();
  const graded = question?.evaluation ? question : null;
  /*
   * Blanks can be graded by hand: against the key before submitting (自评),
   * over the checker afterwards (手动判分). The panel is open only for the
   * stage it was opened in, so it closes by itself once that has passed.
   */
  const stage = question?.spec.kind !== 'blank' ? null : graded ? 'manual' : question.deferred ? null : 'self';
  const [opened, setOpened] = useState<typeof stage>(null);
  const grading = stage !== null && opened === stage;
  const toggle = () => setOpened(grading ? null : stage);

  return (
    <div data-question-footer="" data-attempt-result={question?.status}>
      <div role="status" aria-live="polite" data-footer-status="">
        {graded ? <Grade question={graded} /> : question ? (
          <Answering question={question} grading={grading} onGrading={stage === 'self' ? toggle : undefined} />
        ) : null}
        {question?.storageError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-destructive">{question.storageError}</p>
            <Button variant="outline" size="sm" onClick={question.retryStorage}>重试保存</Button>
          </div>
        ) : null}
      </div>
      {/* Redo sits with 查看解答 so the grade line stays one unit when the footer wraps. */}
      <div data-footer-actions="">
        {stage === 'manual' ? (
          <QuietButton aria-expanded={grading} onClick={toggle}>
            <GavelIcon data-icon="inline-start" />
            手动判分
          </QuietButton>
        ) : null}
        {graded ? (
          <QuietButton onClick={graded.reset}>
            <RotateCcwIcon data-icon="inline-start" />
            {graded.spec.kind === 'self' ? '重新自评' : '重做'}
          </QuietButton>
        ) : null}
        {solution ? <QuestionSolutionSheet meta={meta} solution={solution} /> : null}
      </div>
      {question && stage ? (
        <Collapse key={stage} open={grading}>
          <BlankGradePanel question={question} />
        </Collapse>
      ) : null}
    </div>
  );
}
