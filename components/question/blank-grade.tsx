'use client';

import { rippleButtonVariants } from '@/components/ui/ripple-button';
import { cn } from '@/lib/utils';
import { blankBadge } from './blank-field';
import { readBlankGrades, type BlankGrade, type BlankSpec } from './grading';
import { CheckCheckIcon, CheckIcon, XIcon } from './icons';
import { Pressable } from './live';
import { toneButton } from './looks';
import { MathPreview } from './math-preview';
import type { QuestionState } from './question-state';

/*
 * Grading blanks by hand, with one two-way switch per blank (判对 / 判错,
 * the grade in force filled with its colour). What a switch does follows
 * from where the question stands:
 *
 *   before submitting  对答案自评: the reader compares their own working
 *                      with the key and grades each blank, like an essay,
 *                      without typing anything (formulas can be awkward to
 *                      enter). Grading the last blank submits.
 *   after submitting   手动判分: overrides the checker for that blank.
 *                      Picking the checker's own grade drops the override
 *                      (attempt.ts), so "已改判" only marks real changes.
 *
 * The panel lists every blank with its key, what was typed and its switch;
 * it opens under the footer, and the solution card puts the same switch
 * beside each answer.
 */

/** The key, typeset like the stem: maths by MathPreview, LaTeX keys of text blanks from their compile-time KaTeX HTML. */
export function BlankKey({ blank, className }: { blank: BlankSpec; className?: string }) {
  if (blank.kind === 'math') return <MathPreview text={blank.answer} className={className} />;
  if (blank.html) return <span data-tex-answer="" className={className} dangerouslySetInnerHTML={{ __html: blank.html }} />;
  return <span className={className}>{blank.answer}</span>;
}

/** What the reader typed into a blank, typeset like its key. */
export function BlankEntry({ blank, value }: { blank: BlankSpec; value: string }) {
  return blank.kind === 'math' ? <MathPreview text={value} /> : <>{value}</>;
}

const GRADES = [
  { grade: 'correct', label: '判对', Icon: CheckIcon },
  { grade: 'incorrect', label: '判错', Icon: XIcon },
] as const;

/** Long formulas scroll inside their row instead of widening it. */
const formula = '[&_[data-math-preview]]:max-w-full [&_[data-math-preview]]:overflow-x-auto [&_[data-math-preview]]:overflow-y-hidden [&_[data-tex-answer]]:max-w-full [&_[data-tex-answer]]:overflow-x-auto [&_[data-tex-answer]]:overflow-y-hidden';

export function BlankGradeSwitch({ question, index }: { question: QuestionState; index: number }) {
  if (question.spec.kind !== 'blank') return null;
  const count = question.spec.blanks.length;
  const name = count > 1 ? `第 ${index + 1} 空` : '本题';
  const graded = question.evaluation;
  const current: BlankGrade | undefined = graded
    ? (graded.blanks[index] === 'correct' ? 'correct' : 'incorrect')
    : readBlankGrades(question.selected, count)[index];
  const choose = (grade: BlankGrade) => {
    if (!graded) question.selfGradeBlanks(new Map([[index, grade]]));
    else if (grade !== current) question.gradeBlank(index, grade);
  };
  return (
    <span
      role="group"
      aria-label={`${graded ? '手动判分' : '自评'} · ${name}`}
      data-blank-grade=""
      data-manual={graded?.manual?.[index] ? '' : undefined}
      className="inline-flex shrink-0 gap-0.5 rounded-full bg-(--exam-marker) p-0.75"
    >
      {GRADES.map(({ grade, label, Icon }) => (
        <Pressable
          key={grade}
          data-tone={grade}
          aria-pressed={current === grade}
          disabled={!question.ready}
          className={cn(
            rippleButtonVariants({ variant: 'ghost', size: 'xs' }),
            'h-7.5 gap-1 rounded-full pr-2.5 pl-2 text-xs font-medium text-foreground/70 [--ripple-button-ripple-color:var(--tone)] hover:bg-(--tone-tint) hover:text-(--tone-ink) aria-pressed:bg-(--tone-soft) aria-pressed:text-(--tone-ink) dark:hover:bg-(--tone-tint)',
          )}
          onClick={() => choose(grade)}
        >
          <Icon size={13} aria-hidden animate={current === grade ? 'path' : false} />
          {label}
        </Pressable>
      ))}
    </span>
  );
}

/** Every blank with its key, what was typed and its switch. */
export function BlankGradePanel({ question }: { question: QuestionState }) {
  if (question.spec.kind !== 'blank') return null;
  const { blanks } = question.spec;
  const graded = question.evaluation;
  const several = blanks.length > 1;
  const grades = graded ? [] : readBlankGrades(question.selected, blanks.length);
  const left = blanks.length - grades.filter(Boolean).length;
  const note = 'm-0 text-xs leading-relaxed text-muted-foreground';
  return (
    <div data-grade-panel="" role="group" aria-label={graded ? '手动判分' : '对答案自评'} className="rounded-[0.875rem] border border-(--exam-line) px-3.5 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className={note}>
          {graded
            ? '对照参考答案，自动判分有误时可逐空改判；改判随作答记录保存。'
            : `对照参考答案给每一空判对错，判完${several ? ` ${blanks.length} 空` : ''}即记录成绩。不必先输入答案。`}
        </p>
        {!graded && several ? (
          <Pressable
            data-grade-all=""
            data-tone="correct"
            disabled={!question.ready}
            className={cn(rippleButtonVariants({ variant: 'outline', size: 'xs' }), toneButton, 'h-7.5 gap-1.25 rounded-full border-(--tone-line) bg-(--tone-tint) pr-2.75 pl-2.25 font-semibold text-(--tone-ink) hover:bg-(--tone-soft) dark:border-(--tone-line) dark:bg-(--tone-tint) dark:hover:bg-(--tone-soft)')}
            onClick={() => question.selfGradeBlanks(new Map(blanks.map((_, index) => [index, 'correct'] as const)))}
          >
            <CheckCheckIcon size={14} aria-hidden animateOnHover />全部判对
          </Pressable>
        ) : null}
      </div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {blanks.map((blank, index) => {
          const value = question.values[index]?.trim() ?? '';
          return (
            <li
              key={index}
              data-tone={grades[index]}
              className="m-0 flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[0.625rem] bg-(--tone-tint,transparent) py-1.5 pr-1 pl-2 transition-colors duration-200"
            >
              {several ? <span className="text-muted-foreground">{blankBadge(index)}</span> : null}
              <span data-grade-value="" className={cn('min-w-0 flex-[1_1_8rem] wrap-anywhere [&_[data-math-preview]]:text-[1.0625rem] [&_small]:text-xs [&_small]:font-medium', formula)}>
                <span className="mr-3.5 inline-flex max-w-full flex-wrap items-baseline gap-1.5 font-semibold [&>small]:text-(--exam-correct-ink)"><small>答案</small><BlankKey blank={blank} /></span>
                {value ? <span className="mr-3.5 inline-flex max-w-full flex-wrap items-baseline gap-1.5 text-muted-foreground"><small>你填</small><BlankEntry blank={blank} value={value} /></span> : null}
                {graded?.manual?.[index] ? (
                  <span data-tone="partial" className="inline-block rounded-full bg-(--tone-soft) px-1.75 py-px text-[0.6875rem] font-semibold text-(--tone-ink)">已改判</span>
                ) : null}
              </span>
              <BlankGradeSwitch question={question} index={index} />
            </li>
          );
        })}
      </ul>
      {!graded && several && left > 0 && left < blanks.length ? <p className={cn(note, 'mt-2')}>还剩 {left} 空未判</p> : null}
    </div>
  );
}
