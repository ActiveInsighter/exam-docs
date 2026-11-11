'use client';

import { AnimateIcon } from '@animate-ui/react/icons';
import { blur, transition, useTempoTransition } from '@animate-ui/react/utils/motion';
import { motion } from 'motion/react';
import { GavelIcon } from '@/components/animate-ui/icons/gavel';
import { CheckCheckIcon } from '@/components/animate-ui/icons/check-check';
import { RotateCcwIcon } from '@/components/animate-ui/icons/rotate-ccw';
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RippleButton } from '@/components/ui/ripple-button';
import { cn } from '@/lib/utils';
import { blankBadge } from './blank-field';
import { BlankGradePanel, BlankKey } from './blank-grade';
import { describeResult, formatKey } from './grading';
import type { QuestionMeta } from './model';
import { type QuestionState, useQuestionState } from './question-state';
import { ResultIcon } from './grade-control';
import { SelfGrade } from './self-grade';
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

function QuietButton({ className, ...props }: ComponentProps<typeof RippleButton>) {
  return <AnimateIcon animateOnHover asChild><RippleButton variant="ghost" size="sm" className={cn(quiet, className)} {...props} /></AnimateIcon>;
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
  const swap = useTempoTransition(transition.swap);
  const evaluation = question.evaluation!;
  const unreadable = evaluation.blanks.flatMap((verdict, index) => (verdict === 'invalid' ? [blankBadge(index)] : []));
  return (
    // Keyed by attempt, so the pill's entrance replays on every submission.
    <motion.div key={question.attempt} initial={question.fresh ? { opacity: 0, filter: blur.icon } : false} animate={{ opacity: 1, filter: "blur(0px)" }} transition={swap} className={row}>
      <span data-result-pill="" data-tone={evaluation.result}>
        <ResultIcon result={evaluation.result} animate={question.fresh} />
        {describeResult(spec, evaluation, selected)}
      </span>
      {evaluation.result !== 'correct' && spec.kind !== 'self' ? (
        <span data-result-key="">正确答案 <Key question={question} /></span>
      ) : null}
      {unreadable.length ? <span className={hint}>{unreadable.join('')} 无法识别为数学表达式</span> : null}
    </motion.div>
  );
}

/** What the reader does next: grade an essay, or submit several picks or blanks. */
function Answering({ question, canGrade }: { question: QuestionState; canGrade: boolean }) {
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
      <RippleButton
        size="sm"
        disabled={!question.ready || question.status !== 'draft'}
        onClick={question.submit}
        data-submit-answer=""
        className="h-8 rounded-full px-4"
      >
        提交答案
      </RippleButton>
      {canGrade ? (
        // Formulas can be awkward to type: grade against the key instead, like an essay.
        <CollapsibleTrigger render={<QuietButton />} data-self-grade-toggle="" data-grade-trigger="">
          <CheckCheckIcon data-icon="inline-start" />
          对答案自评
        </CollapsibleTrigger>
      ) : null}
      <span data-submit-hint="" className={hint}>
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
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (grading) return;
    const panel = root.current?.querySelector('[data-slot="collapsible-content"]');
    if (panel?.contains(document.activeElement)) {
      root.current?.querySelector<HTMLElement>('[data-grade-trigger], [data-solution-trigger]')?.focus({ preventScroll: true });
    }
  }, [grading]);

  return (
    <Collapsible ref={root} open={grading} onOpenChange={(next) => setOpened(next ? stage : null)} data-question-footer="" data-attempt-result={question?.status}>
      <div role="status" aria-live="polite" data-footer-status="">
        {graded ? <Grade question={graded} /> : question ? (
          <Answering question={question} canGrade={stage === 'self'} />
        ) : null}
        {question?.storageError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-destructive">{question.storageError}</p>
            <RippleButton variant="outline" size="sm" onClick={question.retryStorage}>重试保存</RippleButton>
          </div>
        ) : null}
      </div>
      {/* Redo sits with 查看解答 so the grade line stays one unit when the footer wraps. */}
      <div data-footer-actions="">
        {stage === 'manual' ? (
          <CollapsibleTrigger render={<QuietButton />} data-grade-trigger="">
            <GavelIcon data-icon="inline-start" />
            手动判分
          </CollapsibleTrigger>
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
        <CollapsibleContent className="basis-full min-w-0">
          <BlankGradePanel question={question} />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
