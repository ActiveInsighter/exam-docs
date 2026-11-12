'use client';

import { getVariants, useAnimateIconContext } from '@animate-ui/react/icons';
import { useShouldReduceMotion } from '@animate-ui/react/utils/motion';
import type { Variants } from 'motion/react';
import { useMemo } from 'react';

/**
 * Animate UI's generic path preset rests fully drawn, then jumps to .05
 * in a passive effect. A newly mounted verdict must start undrawn before
 * its first paint. Keep the official controls, timings and reduced motion;
 * only correct the initial frame of the one-shot feedback draw.
 */
export function useFeedbackVariants(animations: { default: Record<string, Variants>; [key: string]: Record<string, Variants> }): Record<string, Variants> {
  const variants = getVariants(animations);
  const { animation, active, startsAnimated } = useAnimateIconContext();
  const reduce = useShouldReduceMotion();
  return useMemo(() => {
    if (animation !== 'path' || !active || reduce || startsAnimated) return variants;
    return Object.fromEntries(Object.entries(variants).map(([part, variant]) => [part, {
      ...variant,
      initial: { pathLength: 0, opacity: 0 },
      animate: { ...variant.animate as object, opacity: 1 },
    }]));
  }, [variants, animation, active, reduce, startsAnimated]);
}
