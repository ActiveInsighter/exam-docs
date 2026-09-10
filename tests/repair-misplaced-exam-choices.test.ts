import { describe, expect, it } from 'vitest';

// @ts-expect-error The repair script is an executable ESM module without declarations.
import { repairMisplacedExamChoices } from '../scripts/repair-misplaced-exam-choices.mjs';

describe('repairMisplacedExamChoices', () => {
  it('moves an inline A-D choice row out of the explanation', () => {
    const source = `<ExamQuestion>

1. Compare the values（ ）。

<ExamSolution>

<ExamAnswer>B。</ExamAnswer>

<ExamExplanation>
The explanation comes first.
A. first  B. second  C. third  D. fourth
</ExamExplanation>

</ExamSolution>

</ExamQuestion>`;

    const result = repairMisplacedExamChoices(source);

    expect(result.stats).toEqual({ repairedGroups: 1, repairedOptions: 4 });
    expect(result.source).toContain('<ExamChoices>');
    expect(result.source).toContain('<ExamOption>A. first</ExamOption>');
    expect(result.source).toContain('<ExamOption>D. fourth</ExamOption>');
    expect(result.source.indexOf('<ExamChoices>')).toBeLessThan(result.source.indexOf('<ExamSolution>'));
    expect(result.source).toContain('<ExamExplanation>\nThe explanation comes first.\n</ExamExplanation>');
    expect(result.source).not.toContain('The explanation comes first.\nA. first');
  });

  it('moves choices written on separate lines and preserves math', () => {
    const source = `<ExamQuestion>

2. Select the correct expression ( ).

<ExamSolution>
<ExamAnswer>D</ExamAnswer>
<ExamExplanation>
Reasoning.
A. $x$
B. $x^2$
C. $x^3$
D. $x^4$
</ExamExplanation>
</ExamSolution>
</ExamQuestion>`;

    const result = repairMisplacedExamChoices(source);

    expect(result.stats.repairedGroups).toBe(1);
    expect(result.source).toContain('<ExamOption>A. $x$</ExamOption>');
    expect(result.source).toContain('<ExamOption>D. $x^4$</ExamOption>');
    expect(result.source).toContain('<ExamExplanation>\nReasoning.\n</ExamExplanation>');
  });

  it('repairs a choice question even when the answer text is not a single letter', () => {
    const source = `<ExamQuestion>

3. Determine the sign（）。

<ExamSolution>
<ExamAnswer>原选项中没有完全正确的一项。</ExamAnswer>
<ExamExplanation>
Reasoning.
A. zero  B. depends on a  C. depends on a and b  D. independent
</ExamExplanation>
</ExamSolution>
</ExamQuestion>`;

    const result = repairMisplacedExamChoices(source);

    expect(result.stats.repairedGroups).toBe(1);
    expect(result.source).toContain('<ExamChoices>');
  });

  it('does not touch a question that already has structured choices', () => {
    const source = `<ExamQuestion>
1. Select one（ ）。
<ExamChoices>
<ExamOption>A. first</ExamOption>
<ExamOption>B. second</ExamOption>
<ExamOption>C. third</ExamOption>
<ExamOption>D. fourth</ExamOption>
</ExamChoices>
<ExamSolution>
<ExamAnswer>A</ExamAnswer>
<ExamExplanation>Explanation.</ExamExplanation>
</ExamSolution>
</ExamQuestion>`;

    const result = repairMisplacedExamChoices(source);

    expect(result.stats.repairedGroups).toBe(0);
    expect(result.source).toBe(source);
  });

  it('does not treat arbitrary A-D prose as choices without a choice-question signal', () => {
    const source = `<ExamQuestion>
Explain the four cases.
<ExamSolution>
<ExamAnswer>See explanation.</ExamAnswer>
<ExamExplanation>
A. first  B. second  C. third  D. fourth
</ExamExplanation>
</ExamSolution>
</ExamQuestion>`;

    const result = repairMisplacedExamChoices(source);

    expect(result.stats.repairedGroups).toBe(0);
    expect(result.source).toBe(source);
  });
});
