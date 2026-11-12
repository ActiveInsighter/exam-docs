"use client"

import * as React from "react"
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Transition, type Variants } from "motion/react"
import { useTempoTransition } from "@animate-ui/react/utils/motion"
import { cn } from "@/lib/utils"

/**
 * Swap the complete study card while retaining its scrollable panes.
 *
 * Animate UI Tabs.Panel uses a wait sequence: it fades the old content out
 * before mounting/fading the next. For the large two-column solution sheet
 * that leaves a visible empty interval (and measures its height). The old
 * complete split remains overlaid while the next one paints, preserving both
 * columns and their independent scroll positions.
 *
 * AnimatePresence owns exit retention and interruption. The exiting DOM is
 * inert, and popLayout removes it from flow so it cannot resize the sheet.
 */
const panelVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 22 : -22 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -12 : 12 }),
}

const reducedVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

const panelTransition: Transition = {
  opacity: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
  x: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
}

function PanelFrame({
  children,
  transition,
  reducedMotion,
  fill,
  ref,
}: {
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
  transition: Transition
  reducedMotion: boolean
  fill: boolean
}) {
  const present = useIsPresent()
  return (
    <motion.div
      ref={ref}
      data-slot="panel-frame"
      role="group"
      inert={!present}
      tabIndex={-1}
      className={cn("relative min-h-0 min-w-0 outline-none", fill && "flex min-h-0 flex-1 flex-col overflow-hidden")}
      variants={reducedMotion ? reducedVariants : panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

export function PanelSwap({ value, direction, className, children, transition, fill = false }: {
  value: React.Key
  direction: number
  className?: string
  children: React.ReactNode
  transition?: Transition
  /** Fill a fixed-size viewport (the solution stage), not the title row. */
  fill?: boolean
}) {
  const reducedMotion = useReducedMotion() ?? false
  const timedTransition = useTempoTransition(transition ?? panelTransition)
  return (
    <div data-slot="panel-swap" className={cn("relative min-h-0 min-w-0", fill && "flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <PanelFrame
          key={String(value)}
          reducedMotion={reducedMotion}
          fill={fill}
          transition={timedTransition}
        >
          {children}
        </PanelFrame>
      </AnimatePresence>
    </div>
  )
}
