"use client"

import * as React from "react"
import { Tabs } from "@animate-ui/react/primitives/base-ui/tabs"
import { cn } from "@/lib/utils"

export type ModalPageEntry = {
  id: string
  titleId: string
  descriptionId?: string
  depth: number
  close: () => void
}

/** Navigation stores page identity only; official Tabs panels own motion. */
export function useModalNavigation() {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null)
  const [pages, setPages] = React.useState<ModalPageEntry[]>([])
  const register = React.useCallback((page: ModalPageEntry) => {
    setPages((current) => [...current.filter((item) => item.id !== page.id), page].sort((a, b) => a.depth - b.depth))
    return () => setPages((current) => current.filter((item) => item.id !== page.id))
  }, [])
  const top = pages.at(-1)
  return React.useMemo(() => ({ host, setHost, register, pages, top }), [host, pages, register, top])
}

export type ModalNavigation = ReturnType<typeof useModalNavigation>

/** Focus when the official panel becomes visible, including its waiting phase. */
export function focusVisiblePage(panel: HTMLElement, focus: () => void, fallback?: HTMLElement | null) {
  let frame = 0
  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      // Tabs may commit its waiting state in a layout effect. Wait for that
      // commit to settle before focusing; a momentarily visible node can
      // otherwise become hidden and drop focus back to the document.
      if (panel.hidden || panel.inert) return
      observer.disconnect()
      focus()
    })
  }
  const observer = new MutationObserver(schedule)
  observer.observe(panel, { attributes: true, attributeFilter: ["hidden", "inert"] })
  if (panel.hidden || panel.inert) fallback?.focus({ preventScroll: true })
  schedule()
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}

/** Freeze the visible page during dismissal; never reveal its parent mid-exit. */
export function ModalPages({ open, value, children, hostRef }: {
  open: boolean
  value: string
  children: React.ReactNode
  hostRef: React.Ref<HTMLDivElement>
}) {
  const [shown, setShown] = React.useState(value)
  if (open && value !== shown) setShown(value)
  return (
    <Tabs.Root ref={hostRef} value={shown} data-slot="modal-pages" data-page={shown}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </Tabs.Root>
  )
}

export function ModalPageFrame({ value, root = false, children, className, ...props }: React.ComponentProps<typeof Tabs.Panel> & { value: string; root?: boolean }) {
  return (
    <Tabs.Panel
      {...props}
      value={value}
      keepMounted
      data-slot={root ? "modal-root-page" : "modal-page"}
      role="group"
      tabIndex={-1}
      className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col bg-(--modal-surface) outline-none", className)}
    >
      {children}
    </Tabs.Panel>
  )
}
