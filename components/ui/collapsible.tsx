"use client"

import { Collapsible as CollapsiblePrimitive } from "@animate-ui/react/primitives/base-ui/collapsible"
import { cn } from "@/lib/utils"

function Collapsible(props: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger(props: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

function CollapsibleContent({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" className={cn("overflow-hidden", className)} {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
