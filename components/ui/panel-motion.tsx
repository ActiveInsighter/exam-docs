"use client"

import * as React from "react"
import { ReducedMotionConfig, shift, transition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion"
import { AnimatePresence, motion, useIsPresent, type Variants } from "motion/react"
import { cn } from "@/lib/utils"

/** Shared motion language for navigation and decks; no business state here. */
export function usePanelVariants(distance: number = shift.step) {
  const reduce = useShouldReduceMotion()
  const enter = useTempoTransition(transition.panelIn)
  const leave = useTempoTransition(transition.panelOut)
  return React.useMemo<Variants>(() => ({
    enter: (direction: number) => ({ opacity: 0, transform: `translateX(${reduce ? 0 : direction * distance}px)` }),
    center: { opacity: 1, transform: "translateX(0px)", transition: enter },
    exit: (direction: number) => ({
      opacity: 0,
      transform: `translateX(${reduce ? 0 : -direction * distance}px)`,
      transition: leave,
    }),
    back: { opacity: 0, transform: `translateX(${reduce ? 0 : distance}px)`, transition: leave },
  }), [distance, reduce, enter, leave])
}

const PanelFrame = React.forwardRef<HTMLDivElement, { direction: number; children: React.ReactNode }>(function PanelFrame({ direction, children }, ref) {
  const present = useIsPresent()
  const variants = usePanelVariants()
  return (
    <motion.div
      ref={ref}
      data-slot="panel-frame"
      inert={!present}
      aria-hidden={!present || undefined}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !present && "pointer-events-none absolute inset-0")}
    >
      {children}
    </motion.div>
  )
})

/** Enter and exit overlap: rapid navigation never waits for an old exit. */
export function PanelSwap({ value, direction, className, children }: {
  value: React.Key
  direction: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <ReducedMotionConfig>
      <div data-slot="panel-swap" className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", className)}>
        <AnimatePresence mode="sync" initial={false} custom={direction}>
          <PanelFrame key={value} direction={direction}>{children}</PanelFrame>
        </AnimatePresence>
      </div>
    </ReducedMotionConfig>
  )
}
