"use client"

import * as React from "react"
import { motion, useIsPresent } from "motion/react"
import { usePanelVariants } from "@/components/ui/panel-motion"
import { cn } from "@/lib/utils"

export type ModalPageEntry = {
  id: string
  titleId: string
  depth: number
  close: () => void
}

/** One navigation session per open surface; child pages never add overlays. */
export function useModalNavigation() {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null)
  const [pages, setPages] = React.useState<ModalPageEntry[]>([])
  const register = React.useCallback((page: ModalPageEntry) => {
    setPages((current) => [...current.filter((item) => item.id !== page.id), page].sort((a, b) => a.depth - b.depth))
    return () => setPages((current) => current.filter((item) => item.id !== page.id))
  }, [])
  const top = pages.at(-1)
  return React.useMemo(() => ({ host, setHost, register, top }), [host, register, top])
}

export type ModalNavigation = ReturnType<typeof useModalNavigation>

/** Retain covered pages (and their scroll/form state), but never their focus. */
export function ModalPageFrame({ active, root = false, children, className, ...props }: React.ComponentProps<typeof motion.div> & { active: boolean; root?: boolean }) {
  const variants = usePanelVariants()
  const present = useIsPresent()
  const interactive = active && present
  return (
    <motion.div
      {...props}
      data-slot={root ? "modal-root-page" : "modal-page"}
      data-active={interactive ? "" : undefined}
      inert={!interactive}
      aria-hidden={!interactive || undefined}
      variants={variants}
      custom={1}
      initial={root ? false : "enter"}
      animate={active ? "center" : "exit"}
      exit="back"
      className={cn(
        "relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--modal-surface) outline-none",
        !root && "pointer-events-auto absolute inset-0",
        !active && "pointer-events-none",
        className
      )}
    >
      {children}
    </motion.div>
  )
}
