import type { ReactNode } from 'react';
import { ChoiceGroup } from './choice-group';
import { getChoiceDensity } from './choice-layout';
import { getChoiceOptionNodes, getOptionLetter, splitOptionLabel } from './parts';

/**
 * Option grid for a choice question:
 *
 * <ExamChoices>
 * <ExamOption>A. …</ExamOption>
 * <ExamOption>B. …</ExamOption>
 * </ExamChoices>
 *
 * The authored "A. " prefix becomes the option marker. Layout (4 / 2 / 1
 * columns) is chosen from the rendered option widths; interactivity comes
 * from the surrounding <ExamQuestion>.
 */
export function ExamChoices({ children }: { children?: ReactNode }) {
  const options = getChoiceOptionNodes(children).map((node, index) => {
    const { label, content } = splitOptionLabel(node);
    return { label: label ?? getOptionLetter(index), content };
  });

  return (
    <ChoiceGroup
      options={options}
      density={getChoiceDensity(options.map((option) => option.content))}
    />
  );
}
