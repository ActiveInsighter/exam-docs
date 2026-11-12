"use client"

import * as React from "react"
import { Tabs } from "@animate-ui/react/primitives/base-ui/tabs"
import { cn } from "@/lib/utils"

type Snapshot = { value: string; content: React.ReactNode }

/**
 * Keep each visited value's last committed content available to Tabs.Panel.
 * The official primitive owns exit retention, interruption, hidden/inert,
 * direction and reduced motion. Inactive DOM is unmounted by Base UI.
 */
export function PanelSwap({ value, direction, className, children, transition }: {
  value: React.Key
  direction: number
  className?: string
  children: React.ReactNode
  transition?: React.ComponentProps<typeof Tabs.Panel>["transition"]
}) {
  const key = String(value)
  const [cache, setCache] = React.useState<{ value: string; children: React.ReactNode; panels: Snapshot[] }>(() => ({
    value: key, children, panels: [{ value: key, content: children }],
  }))
  if (cache.value !== key || cache.children !== children) {
    const panel = { value: key, content: children }
    const rest = cache.panels.filter((item) => item.value !== key)
    const panels = cache.value === key
      ? cache.panels.map((item) => item.value === key ? panel : item)
      : direction > 0 ? [...rest, panel] : [panel, ...rest]
    setCache({ value: key, children, panels })
  }
  return (
    <Tabs.Root value={key} data-slot="panel-swap" className={cn("relative min-h-0 min-w-0", className)}>
      {cache.panels.map((panel) => (
        <Tabs.Panel key={panel.value} value={panel.value} data-slot="panel-frame" role="group"
          transition={transition}
          aria-labelledby={undefined} tabIndex={-1} className="relative min-h-0 min-w-0 outline-none">
          {panel.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  )
}
