'use client';

import { CheckCheckIcon } from '@/components/animate-ui/icons/check-check';
import { RippleButton } from '@/components/ui/ripple-button';
import { GradeControl } from './grade-control';
import { blankBadge } from './blank-field';
import { readBlankGrades, type BlankGrade, type BlankSpec } from './grading';
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
  { value: 'correct', result: 'correct', label: '判对' },
  { value: 'incorrect', result: 'incorrect', label: '判错' },
] as const;

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
      data-blank-grade=""
      data-manual={graded?.manual?.[index] ? '' : undefined}
    >
      <GradeControl label={`${graded ? '手动判分' : '自评'} · ${name}`} items={GRADES} value={current} disabled={!question.ready} onChange={(value) => choose(value as BlankGrade)} />
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
  return (
    <div data-grade-panel="" role="group" aria-label={graded ? '手动判分' : '对答案自评'}>
      <div data-grade-panel-head="">
        <p>
          {graded
            ? '对照参考答案，自动判分有误时可逐空改判；改判随作答记录保存。'
            : `对照参考答案给每一空判对错，判完${several ? ` ${blanks.length} 空` : ''}即记录成绩。不必先输入答案。`}
        </p>
        {!graded && several ? (
          <RippleButton
            variant="secondary"
            size="sm"
            data-grade-all=""
            data-tone="correct"
            disabled={!question.ready}
            onClick={() => question.selfGradeBlanks(new Map(blanks.map((_, index) => [index, 'correct'] as const)))}
          >
            <CheckCheckIcon animateOnHover aria-hidden="true" data-icon="inline-start" />全部判对
          </RippleButton>
        ) : null}
      </div>
      <ul>
        {blanks.map((blank, index) => {
          const value = question.values[index]?.trim() ?? '';
          return (
            <li key={index} data-tone={grades[index]}>
              {several ? <span data-grade-badge="">{blankBadge(index)}</span> : null}
              <span data-grade-value="">
                <span data-grade-key=""><small>答案</small><BlankKey blank={blank} /></span>
                {value ? <span><small>你填</small><BlankEntry blank={blank} value={value} /></span> : null}
                {graded?.manual?.[index] ? <span data-grade-note="" data-tone="partial">已改判</span> : null}
              </span>
              <BlankGradeSwitch question={question} index={index} />
            </li>
          );
        })}
      </ul>
      {!graded && several && left > 0 && left < blanks.length ? <p>还剩 {left} 空未判</p> : null}
    </div>
  );
}
