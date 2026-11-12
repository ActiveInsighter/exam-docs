'use client';

import { Collapsible } from '@animate-ui/react/primitives/base-ui/collapsible';
import { transition, useTempoTransition } from '@animate-ui/react/utils/motion';
import { ListChecksIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { blankBadge } from './blank-field';
import { BlankGradePanel, BlankKey } from './blank-grade';
import { describeResult, formatKey } from './grading';
import { GavelIcon, RotateCcwIcon } from './icons';
import { Animated, Pressable } from './live';
import { choiceLetters, hint, quietButton } from './looks';
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

const row = 'flex flex-wrap items-center gap-x-3 gap-y-2';

/** A quiet capsule; pointing at it plays its icon. */
function QuietButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Animated animateOnHover asChild>
      <Button variant="ghost" size="sm" className={cn(quietButton, className)} {...props} />
    </Animated>
  );
}

/** The key under a wrong answer; of several blanks only the ones missed. */
function Key({ question }: { question: QuestionState }) {
  const { spec, evaluation } = question;
  const chip = 'inline-flex max-w-full min-h-7 min-w-0 flex-wrap items-center gap-1.5 rounded-[0.625rem] border border-(--exam-correct-line) bg-(--exam-correct-tint) px-2.5 py-0.5 text-[0.9375rem] text-(--exam-correct-ink) [&_[data-math-preview]]:max-w-full [&_[data-math-preview]]:overflow-x-auto [&_[data-math-preview]]:overflow-y-hidden';
  if (spec.kind !== 'blank') {
    return <span className={cn(chip, spec.kind === 'choice' && choiceLetters)}>{formatKey(spec)}</span>;
  }
  const several = spec.blanks.length > 1;
  return spec.blanks.map((blank, index) => (several && evaluation?.blanks[index] === 'correct' ? null : (
    <span key={index} className={chip}>
      {several ? <small>{blankBadge(index)}</small> : null}
      <BlankKey blank={blank} />
    </span>
  )));
}

/** How the reader did: the grade, the key when it was missed, and blanks the checker could not read. */
function Grade({ question }: { question: QuestionState }) {
  const { spec, selected, fresh } = question;
  const evaluation = question.evaluation!;
  const settle = useTempoTransition(transition.reveal);
  const Icon = RESULT_ICONS[evaluation.result];
  // A grade given in this visit slides in; a restored one is simply there.
  const Pill = fresh ? motion.span : 'span';
  const unreadable = evaluation.blanks.flatMap((verdict, index) => (verdict === 'invalid' ? [blankBadge(index)] : []));
  return (
    // Keyed by attempt, so the pill's entrance replays on every submission.
    <div key={question.attempt} className={row}>
      <Pill
        data-result-pill=""
        data-tone={evaluation.result}
        {...(fresh ? { initial: { opacity: 0, x: -6 }, animate: { opacity: 1, x: 0 }, transition: settle } : null)}
        // As tall as the buttons beside it, so the footer is one row of capsules.
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--tone-line) bg-(--tone-tint) pr-3.25 pl-2.5 text-[0.8125rem] font-semibold whitespace-nowrap text-(--tone-ink)"
      >
        <Icon aria-hidden className="shrink-0 text-(--tone)" animate={fresh ? 'path' : false} />
        {describeResult(spec, evaluation, selected)}
      </Pill>
      {evaluation.result !== 'correct' && spec.kind !== 'self' ? (
        <span data-result-key="" className="inline-flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          正确答案 <Key question={question} />
        </span>
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
  // A single answer is graded on the click itself: nothing to submit.
  if (spec.kind === 'boolean' || (spec.kind === 'choice' && !spec.multiple)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pressable
        disabled={!question.ready || question.status !== 'draft'}
        onClick={question.submit}
        data-submit-answer=""
        // An empty answer: the button waits as a quiet outline rather than a grey block.
        className={cn(buttonVariants({ size: 'sm' }), 'h-8 rounded-full px-4 disabled:border-(--exam-line) disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100')}
      >
        提交答案
      </Pressable>
      {onGrading ? (
        // Formulas can be awkward to type: grade against the key instead, like an essay.
        <QuietButton aria-expanded={grading} onClick={onGrading} data-self-grade-toggle="">
          <ListChecksIcon data-icon="inline-start" />
          对答案自评
        </QuietButton>
      ) : null}
      {/* Narrow cards keep submit, self-grade and 查看解答 on one row; the hint is the first to go. */}
      <span data-submit-hint="" className={cn(hint, '@max-[34rem]/exam-card:hidden')}>
        {spec.kind === 'choice'
          ? (selected.length ? `已选 ${selected.length} 项` : '可多选，选出全部正确项后提交')
          : `${spec.blanks.length > 1 ? '回车跳到下一空' : '回车提交'}${spec.blanks.some((blank) => blank.kind === 'math') ? ' · 数学空可用屏幕键盘输入' : ''}`}
      </span>
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
  const stage = question?.spec.kind !== 'blank' ? null : graded ? 'manual' : 'self';
  const [opened, setOpened] = useState<typeof stage>(null);
  const grading = stage !== null && opened === stage;
  const toggle = () => setOpened(grading ? null : stage);

  return (
    <div
      data-question-footer=""
      data-attempt-result={question?.status}
      // A single-answer question without a solution has nothing to show yet.
      className="mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-dashed border-(--exam-rule) pt-2 has-[>[data-footer-status]:empty]:has-[>[data-footer-actions]:empty]:hidden"
    >
      <div role="status" aria-live="polite" data-footer-status="" className="min-w-0 flex-auto empty:basis-0">
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
      <div data-footer-actions="" className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-1 empty:hidden">
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
        // The grading panel takes a row of its own; it unfolds, and is unmounted once folded.
        <Collapsible.Root key={stage} open={grading} className="min-w-0 basis-full empty:hidden">
          <Collapsible.Panel>
            <BlankGradePanel question={question} />
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}
    </div>
  );
}
