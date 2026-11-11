"use client"

import * as React from "react"
import {
  RippleButton as RippleButtonPrimitive,
  RippleButtonRipples as RippleButtonRipplesPrimitive,
  type RippleButtonRipplesProps,
} from "@animate-ui/react/primitives/buttons/ripple"
import { type VariantProps } from "class-variance-authority"
import { type HTMLMotionProps } from "motion/react"

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
    <RippleButtonPrimitive
      type={type}
      className={cn(buttonVariants({ variant, size }), rippleColors[variant ?? "default"], className)}
      {...props}
    >
      {children}
      {ripples ? <RippleButtonRipples /> : null}
    </RippleButtonPrimitive>
  )
}

function RippleButtonRipples(props: RippleButtonRipplesProps) {
  return <RippleButtonRipplesPrimitive {...props} />
}

export { RippleButton, RippleButtonRipples }
export type { RippleButtonProps, RippleButtonRipplesProps }
