"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/*
 * Click-to-fill (radial colour reveal). A button given `revealed` carries an
 * ink layer in --reveal-color that, when `revealed` turns true, spreads as a
 * circle from the point the button was pressed until it covers the button,
 * and draws back into the latest press point when it turns false. Keyboard
 * presses spread from the default origin (--reveal-x / --reveal-y, the centre
 * unless a stylesheet moves it). The layer and its motion are CSS
 * (styles/reveal.css), which also sizes the circle; this only records the
 * press point, written straight on the element so a press re-renders nothing.
 */
type RevealProps = {
  /** true fills the button, false empties it; leave unset for no fill layer. */
  revealed?: boolean
}

const revealVars = ["--reveal-x", "--reveal-y"] as const

function recordRevealOrigin(event: React.PointerEvent<HTMLElement>) {
  const element = event.currentTarget
  const box = element.getBoundingClientRect()
  if (!box.width || !box.height) return
  // Fractions of the box, so a press point survives the press-down scale.
  const x = (event.clientX - box.left) / box.width
  const y = (event.clientY - box.top) / box.height
  element.style.setProperty("--reveal-x", `${(x * 100).toFixed(2)}%`)
  element.style.setProperty("--reveal-y", `${(y * 100).toFixed(2)}%`)
}

function clearRevealOrigin(element: HTMLElement) {
  for (const name of revealVars) element.style.removeProperty(name)
}

/** Pointer and click handlers that keep the fill's origin on the press point. */
function revealHandlers<
  P extends React.PointerEvent<HTMLElement>,
  C extends React.MouseEvent<HTMLElement>,
>(
  revealed: boolean | undefined,
  onPointerDown: ((event: P) => void) | undefined,
  onClick: ((event: C) => void) | undefined
) {
  if (revealed === undefined) return { onPointerDown, onClick }
  return {
    onPointerDown: (event: P) => {
      recordRevealOrigin(event)
      onPointerDown?.(event)
    },
    onClick: (event: C) => {
      // detail 0: Enter or Space, not a pointer.
      if (event.detail === 0) clearRevealOrigin(event.currentTarget)
      onClick?.(event)
    },
  }
}

function revealState(revealed: boolean | undefined) {
  return revealed === undefined ? undefined : revealed ? "on" : "off"
}

function Button({
  className,
  variant = "default",
  size = "default",
  revealed,
  onPointerDown,
  onClick,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & RevealProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-reveal={revealState(revealed)}
      className={cn(buttonVariants({ variant, size, className }), revealed !== undefined && "relative isolate")}
      {...revealHandlers(revealed, onPointerDown, onClick)}
      {...props}
    />
  )
}

/*
 * Tile: a selectable card, for options, answers and choices whose content
 * is more than a label (it wraps, aligns left and may hold formulas or
 * images). A quiet surface lifted by a hairline ring and a soft shadow; it
 * brightens on hover, gives on press, and with `revealed` fills from the
 * press point. Colours are --tile-* tokens (styles/tokens/components.css),
 * which a stylesheet can override per state, e.g. --tile-ring for a
 * coloured outline and --reveal-color for the fill.
 *
 * `tileVariants({ interactive: false })` gives a static element the same look.
 */
const tileVariants = cva(
  "relative isolate flex min-w-0 rounded-(--tile-radius) bg-(--tile-bg) text-left text-foreground [font:inherit] [box-shadow:inset_0_0_0_var(--tile-ring-width)_var(--tile-ring),var(--tile-shadow)] [--reveal-color:var(--tile-fill)] [--reveal-inset:1.5px] transition-[background-color,box-shadow,opacity,scale] duration-200 ease-(--ui-ease)",
  {
    variants: {
      interactive: {
        true: "cursor-pointer outline-none select-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:cursor-default not-aria-disabled:active:scale-[0.985] not-aria-disabled:not-data-[reveal=on]:hover:bg-(--tile-bg-hover) not-aria-disabled:not-data-[reveal=on]:hover:[--tile-shadow:var(--tile-shadow-hover)]",
        false: "",
      },
      size: {
        default: "min-h-12 items-center gap-3 px-3.5 py-2.5",
        sm: "min-h-10 items-center gap-2 px-3 py-2 text-sm",
        lg: "min-h-14 items-center gap-3.5 px-4 py-3",
      },
    },
    defaultVariants: {
      interactive: true,
      size: "default",
    },
  }
)

function TileButton({
  className,
  size = "default",
  revealed,
  onPointerDown,
  onClick,
  ...props
}: ButtonPrimitive.Props & Omit<VariantProps<typeof tileVariants>, "interactive"> & RevealProps) {
  return (
    <ButtonPrimitive
      data-slot="tile-button"
      data-reveal={revealState(revealed)}
      className={cn(tileVariants({ size, className }))}
      {...revealHandlers(revealed, onPointerDown, onClick)}
      {...props}
    />
  )
}

export { Button, buttonVariants, TileButton, tileVariants }
