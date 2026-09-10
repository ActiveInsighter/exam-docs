export type ChoiceColumnCount = 1 | 2 | 4;

const FIT_EPSILON_PX = 1;

function getCandidateColumns(optionCount: number): ChoiceColumnCount[] {
  if (optionCount >= 4) return [4, 2, 1];
  if (optionCount >= 2) return [2, 1];
  return [1];
}

type ChoiceColumnInput = {
  containerWidth: number;
  optionWidths: readonly number[];
  columnGap: number;
};

/**
 * Picks the densest 4/2/1-column layout whose widest option fits without
 * soft-wrapping. Widths are measured from the rendered DOM by the enhancer.
 */
export function getChoiceColumnCount({
  containerWidth,
  optionWidths,
  columnGap,
}: ChoiceColumnInput): ChoiceColumnCount {
  if (
    !Number.isFinite(containerWidth) ||
    containerWidth <= 0 ||
    optionWidths.length === 0 ||
    optionWidths.some((width) => !Number.isFinite(width) || width < 0)
  ) {
    return 1;
  }

  const safeGap = Number.isFinite(columnGap) && columnGap > 0 ? columnGap : 0;
  const widestOption = Math.max(...optionWidths);

  for (const columns of getCandidateColumns(optionWidths.length)) {
    if (columns === 1) return 1;

    const totalGap = safeGap * (columns - 1);
    const availableWidth = containerWidth - totalGap;
    if (availableWidth <= 0) continue;

    const trackWidth = availableWidth / columns;
    if (widestOption <= trackWidth + FIT_EPSILON_PX) {
      return columns;
    }
  }

  return 1;
}
