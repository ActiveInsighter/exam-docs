import type { TagColor } from '@/lib/question-store/types';
import { cn } from '@/lib/utils';

/*
 * The reader's tag colours: the same family as the result tones (red, amber
 * and green are those tones' bases). The others take the same share of the
 * gamut, so no dot outshines its neighbour.
 */
export const TAG_COLORS: Record<TagColor, string> = {
  gray: 'oklch(0.66 0.004 250)',
  red: 'var(--exam-incorrect)',
  orange: 'oklch(0.68 0.09 54)',
  amber: 'var(--exam-missed)',
  green: 'var(--exam-correct)',
  teal: 'oklch(0.65 0.065 195)',
  blue: 'oklch(0.62 0.1 256)',
  violet: 'oklch(0.62 0.105 296)',
  pink: 'oklch(0.66 0.11 352)',
};

/** The coloured dot of a reader's tag. */
export function TagDot({ color, className }: { color: TagColor; className?: string }) {
  return <span data-tag-dot="" aria-hidden="true" style={{ background: TAG_COLORS[color] }} className={cn('size-2 shrink-0 rounded-full', className)} />;
}
