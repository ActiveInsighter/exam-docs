import { describe, expect, it } from 'vitest';

// @ts-expect-error The migration script is an executable ESM module without declarations.
import { migrateExamDocument } from '../scripts/migrate-exam-docs.mjs';

describe('migrateExamDocument', () => {
  it('wraps a legacy question, expands inline choices, and splits the answer', () => {
    const source = `---
title: Example
---

# Example

1. Which option is correct（ ）。

<div className="choice-options">
<div className="choice-option-row">A. first &emsp;&emsp; B. second &emsp;&emsp; C. third &emsp;&emsp; D. fourth</div>
</div>

<details>
<summary>查看答案与解析</summary>

**答案：** C

**解析：** The third option is correct.

</details>
`;

    const result = migrateExamDocument(source);

    expect(result.stats).toMatchObject({
      questions: 1,
      solutions: 1,
      answerMarkers: 1,
      choiceGroups: 1,
      options: 4,
    });
    expect(result.source).toContain('<ExamQuestion>');
    expect(result.source).toContain('<ExamChoices>');
    expect(result.source).toContain('<ExamOption>A. first</ExamOption>');
    expect(result.source).toContain('<ExamOption>D. fourth</ExamOption>');
    expect(result.source).toContain('<ExamAnswer>C</ExamAnswer>');
    expect(result.source).toContain(
      '<ExamExplanation>\nThe third option is correct.\n</ExamExplanation>',
    );
    expect(result.source).not.toContain('<details>');
    expect(result.source).not.toContain('choice-option-row');
  });

  it('supports plain answer labels and choices written on separate lines', () => {
    const source = `1. Select the correct option.

A. first
B. second
C. third
D. fourth

<details>
<summary>查看答案与解析</summary>

答案：D

解析：The fourth option is correct.

</details>`;

    const result = migrateExamDocument(source);

    expect(result.stats).toMatchObject({
      questions: 1,
      solutions: 1,
      answerMarkers: 1,
      choiceGroups: 1,
      options: 4,
    });
    expect(result.source).toContain('<ExamOption>A. first</ExamOption>');
    expect(result.source).toContain('<ExamOption>D. fourth</ExamOption>');
    expect(result.source).toContain('<ExamAnswer>D</ExamAnswer>');
    expect(result.source).toContain(
      '<ExamExplanation>\nThe fourth option is correct.\n</ExamExplanation>',
    );
  });

  it('keeps multi-line option content inside a valid ExamOption element', () => {
    const source = `1. Select the matrix.

A.
$$
\\begin{bmatrix}
1&0\\\\
0&1
\\end{bmatrix}
$$
B. second
C. third
D. fourth

<details>
<summary>查看答案与解析</summary>

答案：A

解析：The matrix is the identity.

</details>`;

    const result = migrateExamDocument(source);

    expect(result.source).toContain(
      '<ExamOption>\nA.\n$$\n\\begin{bmatrix}',
    );
    expect(result.source).toContain('\\end{bmatrix}\n$$\n</ExamOption>');
    expect(result.source).not.toContain('$$</ExamOption>');
  });

  it('attaches a trailing D option formula before closing the choice group', () => {
    const source = `1. Select the matrix.

A. first
B. second
C. third
D.
$$
\\begin{bmatrix}
1&0\\\\
0&1
\\end{bmatrix}
$$

<details>
<summary>查看答案与解析</summary>

答案：D

解析：The fourth option is correct.

</details>`;

    const result = migrateExamDocument(source);

    expect(result.source).toContain(
      '<ExamOption>\nD.\n\n$$\n\\begin{bmatrix}',
    );
    expect(result.source).toContain('\\end{bmatrix}\n$$\n</ExamOption>');
    expect(result.source).toContain('</ExamOption>\n</ExamChoices>');
  });

  it('converts multi-line single-dollar option math to a display block', () => {
    const source = `1. Select the matrix.

A. $
\\begin{bmatrix}
1&0\\\\
0&1
\\end{bmatrix}
$
B. second
C. third
D. fourth

<details>
<summary>查看答案与解析</summary>

答案：A

解析：The matrix is the identity.

</details>`;

    const result = migrateExamDocument(source);

    expect(result.source).toContain(
      '<ExamOption>\nA.\n\n$$\n\\begin{bmatrix}',
    );
    expect(result.source).toContain('\\end{bmatrix}\n$$\n</ExamOption>');
  });

  it('unwraps exercise answer rows while retaining multi-block answer content', () => {
    const source = `1. Solve the problem.

<details>
<summary>查看答案与解析</summary>

<div className="exercise-label-row">
<strong>答案：</strong>
<div className="exercise-label-body">

$$
x=1
$$

</div>
</div>

The second answer line.

**解析：** Substitute the result into the original equation.

</details>`;

    const result = migrateExamDocument(source);

    expect(result.stats.answerMarkers).toBe(1);
    expect(result.source).toContain('<ExamAnswer>');
    expect(result.source).toContain('x=1');
    expect(result.source).toContain('The second answer line.');
    expect(result.source).toContain(
      '<ExamExplanation>\nSubstitute the result into the original equation.\n</ExamExplanation>',
    );
    expect(result.source).not.toContain('exercise-label-row');
    expect(result.source).not.toContain('exercise-label-body');
  });

  it('unwraps an exercise explanation row as well as the answer row', () => {
    const source = `1. Prove the statement.

<details>
<summary>查看答案与解析</summary>

**答案：** 正确。

<div className="exercise-label-row">
<strong>解析：</strong>
<div className="exercise-label-body">

Use the definition directly.

</div>
</div>

</details>`;

    const result = migrateExamDocument(source);

    expect(result.stats.answerMarkers).toBe(1);
    expect(result.source).toContain('<ExamAnswer>正确。</ExamAnswer>');
    expect(result.source).toContain(
      '<ExamExplanation>\nUse the definition directly.\n</ExamExplanation>',
    );
    expect(result.source).not.toContain('exercise-label-row');
    expect(result.source).not.toContain('exercise-label-body');
  });
});
