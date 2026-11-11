"use client"

import * as React from "react"
import {
  RippleButton as RippleButtonPrimitive,
  RippleButtonRipples as RippleButtonRipplesPrimitive,
  type RippleButtonRipplesProps,
} from "@animate-ui/react/primitives/buttons/ripple"
import { type VariantProps } from "class-variance-authority"
import { motion, type HTMLMotionProps } from "motion/react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
 * Animate UI's Ripple Button in the site's button variants: it gives on
 * press, and a ripple spreads from the point pressed. The ripple takes
 * --ripple-button-ripple-color, which follows the variant and can be set
 * per state by the caller (the question options colour it by result).
 *
 *   <RippleButton variant="secondary">提交</RippleButton>
 *
 * The ripples are rendered for you; pass `ripples={false}` to place
 * <RippleButtonRipples /> yourself (say, under the content).
 */

const rippleColors: Record<NonNullable<VariantProps<typeof buttonVariants>["variant"]>, string> = {
  default: "[--ripple-button-ripple-color:var(--primary-foreground)]",
  outline: "[--ripple-button-ripple-color:var(--foreground)]",
  secondary: "[--ripple-button-ripple-color:var(--secondary-foreground)]",
  ghost: "[--ripple-button-ripple-color:var(--foreground)]",
  destructive: "[--ripple-button-ripple-color:var(--destructive)]",
  link: "[--ripple-button-ripple-color:var(--primary)]",
}

/** The classes of a ripple button, for an element that should look like one. */
function rippleButtonVariants({ variant = "default", size = "default" }: VariantProps<typeof buttonVariants> = {}) {
  return cn(buttonVariants({ variant, size }), rippleColors[variant ?? "default"])
}

function centerKeyboardClick(event: React.MouseEvent<HTMLButtonElement>) {
  if (event.detail !== 0) return
  const rect = event.currentTarget.getBoundingClientRect()
  event.clientX = rect.left + rect.width / 2
  event.clientY = rect.top + rect.height / 2
}

type RippleButtonSurfaceProps = Omit<React.ComponentProps<typeof RippleButtonPrimitive>, "asChild">

/** Shared unstyled surface: keyboard/assistive clicks have no pointer coordinates. */
function RippleButtonSurface({ children, ...props }: RippleButtonSurfaceProps) {
  return (
    <RippleButtonPrimitive {...props} asChild>
      {/* Slot runs the child's handler before the primitive's on the same
          React click event. Capture and bubble receive separate events. */}
      <motion.button onClick={centerKeyboardClick}>{children}</motion.button>
    </RippleButtonPrimitive>
  )
}

type RippleButtonProps = Omit<HTMLMotionProps<"button">, "children"> &
  VariantProps<typeof buttonVariants> & {
    /** Scale while pressed; Animate UI's press scale by default. */
    tapScale?: number
    hoverScale?: number
    /** Render the ripples after the content (default). */
    ripples?: boolean
    children?: React.ReactNode
  }

function RippleButton({
  className,
  variant = "default",
  size = "default",
  ripples = true,
  type = "button",
  children,
  ...props
}: RippleButtonProps) {
  return (
    <RippleButtonSurface
      type={type}
      className={cn(rippleButtonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
      {ripples ? <RippleButtonRipples /> : null}
    </RippleButtonSurface>
  )
}

function RippleButtonRipples(props: RippleButtonRipplesProps) {
  return <RippleButtonRipplesPrimitive {...props} />
}

export { RippleButton, RippleButtonSurface, RippleButtonRipples, rippleButtonVariants }
export type { RippleButtonProps, RippleButtonRipplesProps }
