'use client';

import { CheckCheckIcon, CheckIcon, XIcon } from 'lucide-react';
import { blankBadge } from './blank-field';
import { readBlankGrades, type BlankGrade, type BlankSpec } from './grading';
import { MathPreview } from './math-preview';
import type { QuestionState } from './question-state';

/*
 * Grading blanks by hand, in two situations:
 *
 *   before submitting  对答案自评: the reader compares their own working
 *                      with the key and grades each blank, like an essay,
 *                      without typing anything (formulas can be awkward to
 *                      enter). Grading the last blank submits.
 *   after submitting   手动判分: per blank, 判对 / 判错 overrides the
 *                      checker. Picking the checker's own grade drops the
 *                      override (question-state.tsx), so "已改判" only marks
 *                      real changes.
 *
 * Both use one two-way switch, the grade in force filled with its colour.
 * Shown under the footer on the page and beside each answer in the
 * solution card.
 */

function blankLabel(question: QuestionState, index: number) {
  return question.spec.kind === 'blank' && question.spec.blanks.length > 1 ? `第 ${index + 1} 空` : '本题';
}

function GradeSwitch({ label, current, disabled, manual, onChoose }: {
  label: string;
  current: BlankGrade | undefined;
  disabled: boolean;
  manual?: boolean;
  onChoose: (grade: BlankGrade) => void;
}) {
  return (
    <span role="group" aria-label={label} data-blank-grade="" data-manual={manual ? '' : undefined} data-unset={current ? undefined : ''}>
      <button type="button" data-grade="correct" aria-pressed={current === 'correct'} disabled={disabled} onClick={() => onChoose('correct')}>
        <CheckIcon aria-hidden="true" />判对
      </button>
      <button type="button" data-grade="incorrect" aria-pressed={current === 'incorrect'} disabled={disabled} onClick={() => onChoose('incorrect')}>
        <XIcon aria-hidden="true" />判错
      </button>
    </span>
  );
}

/** After submitting: overrides the checker for one blank. */
export function BlankGradeSwitch({ question, index }: { question: QuestionState; index: number }) {
  const verdict = question.evaluation?.blanks[index];
  const manual = question.evaluation?.manual?.[index] ?? false;
  const current: BlankGrade = verdict === 'correct' ? 'correct' : 'incorrect';
  return (
    <GradeSwitch
      label={`手动判分 · ${blankLabel(question, index)}`}
      current={current}
      manual={manual}
      disabled={!question.ready}
      onChoose={(grade) => { if (grade !== current) question.gradeBlank(index, grade); }}
    />
  );
}

/** Before submitting: the reader's own grade for one blank; the last one submits. */
export function BlankSelfGradeSwitch({ question, index }: { question: QuestionState; index: number }) {
  const count = question.spec.kind === 'blank' ? question.spec.blanks.length : 0;
  const current = readBlankGrades(question.selected, count)[index];
  return (
    <GradeSwitch
      label={`自评 · ${blankLabel(question, index)}`}
      current={current}
      disabled={!question.ready || question.deferred}
      onChoose={(grade) => question.selfGradeBlanks(new Map([[index, grade]]))}
    />
  );
}

function Typed({ blank, value }: { blank: BlankSpec; value: string }) {
  if (!value) return <span data-manual-grade-empty="">未作答</span>;
  return blank.kind === 'math' ? <MathPreview text={value} /> : <>{value}</>;
}

/** Every blank of a submitted question with what was entered and its switch. */
export function ManualGradePanel({ question }: { question: QuestionState }) {
  if (question.spec.kind !== 'blank' || !question.submitted || !question.evaluation) return null;
  const { blanks } = question.spec;
  return (
    <div data-manual-grade="" role="group" aria-label="手动判分">
      <p data-manual-grade-hint="">对照参考答案，自动判分有误时可逐空改判；改判随作答记录保存。</p>
      <ul>
        {blanks.map((blank, index) => (
          <li key={index}>
            {blanks.length > 1 ? <span data-manual-grade-badge="">{blankBadge(index)}</span> : null}
            <span data-manual-grade-value="">
              <Typed blank={blank} value={question.values[index]?.trim() ?? ''} />
            </span>
            {question.evaluation?.manual?.[index] ? <span data-manual-grade-note="">已改判</span> : null}
            <BlankGradeSwitch question={question} index={index} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The key, typeset like the stem. */
export function BlankKey({ blank }: { blank: BlankSpec }) {
  return blank.kind === 'math' ? <MathPreview text={blank.answer} /> : <>{blank.answer}</>;
}

/**
 * 对答案自评, before submitting: each blank's key beside what was typed (if
 * anything) and a switch. "全部判对" grades every blank at once.
 */
export function SelfGradePanel({ question }: { question: QuestionState }) {
  if (question.spec.kind !== 'blank' || question.submitted) return null;
  const { blanks } = question.spec;
  const grades = readBlankGrades(question.selected, blanks.length);
  const left = grades.filter((grade) => !grade).length;
  return (
    <div data-manual-grade="" data-mode="self" role="group" aria-label="对答案自评">
      <div data-manual-grade-head="">
        <p data-manual-grade-hint="">
          对照参考答案给每一空判对错{blanks.length > 1 ? `，判完 ${blanks.length} 空即记录成绩` : '，判完即记录成绩'}。不必先输入答案。
        </p>
        {blanks.length > 1 ? (
          <button
            type="button"
            data-grade-all=""
            disabled={!question.ready}
            onClick={() => question.selfGradeBlanks(new Map(blanks.map((_, index) => [index, 'correct'] as const)))}
          >
            <CheckCheckIcon aria-hidden="true" />全部判对
          </button>
        ) : null}
      </div>
      <ul>
        {blanks.map((blank, index) => {
          const value = question.values[index]?.trim() ?? '';
          return (
            <li key={index} data-graded={grades[index] ?? undefined}>
              {blanks.length > 1 ? <span data-manual-grade-badge="">{blankBadge(index)}</span> : null}
              <span data-manual-grade-value="">
                <span data-manual-grade-key="">
                  <span data-manual-grade-label="">答案</span>
                  <BlankKey blank={blank} />
                </span>
                {value ? (
                  <span data-manual-grade-typed="">
                    <span data-manual-grade-label="">你填</span>
                    <Typed blank={blank} value={value} />
                  </span>
                ) : null}
              </span>
              <BlankSelfGradeSwitch question={question} index={index} />
            </li>
          );
        })}
      </ul>
      {blanks.length > 1 && left > 0 && left < blanks.length ? (
        <p data-manual-grade-progress="">还剩 {left} 空未判</p>
      ) : null}
    </div>
  );
}
