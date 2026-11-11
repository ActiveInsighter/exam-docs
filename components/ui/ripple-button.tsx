"use client";

import * as React from "react";
import {
  RippleButton as RippleButtonPrimitive,
  RippleButtonRipples as RippleButtonRipplesPrimitive,
  type RippleButtonRipplesProps,
} from "@animate-ui/react/primitives/buttons/ripple";
import { type VariantProps } from "class-variance-authority";
import { type HTMLMotionProps } from "motion/react";

import { buttonVariants } from "@/components/ui/button";
import { ActionIconContext, useActionIcon } from "@/components/ui/action-icon";
import { cn } from "@/lib/utils";

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
  choice: "[--ripple-button-ripple-color:var(--tone,var(--foreground))]",
};

type RippleButtonProps = Omit<HTMLMotionProps<"button">, "children"> &
  VariantProps<typeof buttonVariants> & {
    /** Scale while pressed; Animate UI's press scale by default. */
    tapScale?: number;
    hoverScale?: number;
    /** Render the ripples after the content (default). */
    ripples?: boolean;
    children?: React.ReactNode;
  };

function RippleButton({
  className,
  variant = "default",
  size = "default",
  ripples = true,
  tapScale,
  type = "button",
  children,
  onClickCapture,
  onFocus,
  onBlur,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  ...props
}: RippleButtonProps) {
  // The primitive receives (0, 0) for keyboard clicks. Center its visual
  // feedback without replacing the library's ripple lifecycle or easing.
  const [keyboard, setKeyboard] = React.useState(false);
  const icon = useActionIcon();
  const locked = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return (
    <RippleButtonPrimitive
      type={type}
      tapScale={locked ? 1 : tapScale}
      className={cn(buttonVariants({ variant, size }), rippleColors[variant ?? "default"], className)}
      {...props}
      onFocus={(event) => {
        icon.onFocus();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        icon.onBlur();
        onBlur?.(event);
      }}
      onPointerEnter={(event) => {
        icon.onPointerEnter(event);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        icon.onPointerLeave();
        onPointerLeave?.(event);
      }}
      onPointerDown={(event) => {
        icon.onPointerDown();
        onPointerDown?.(event);
      }}
      onClickCapture={(event) => {
        onClickCapture?.(event);
        if (event.defaultPrevented || locked) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        setKeyboard(event.detail === 0);
      }}
    >
      <ActionIconContext.Provider value={icon.active}>{children}</ActionIconContext.Provider>
      {ripples ? (
        <RippleButtonRipples
          aria-hidden="true"
          style={keyboard ? { left: "calc(50% - 10px)", top: "calc(50% - 10px)" } : undefined}
        />
      ) : null}
    </RippleButtonPrimitive>
  );
}

function RippleButtonRipples(props: RippleButtonRipplesProps) {
  return <RippleButtonRipplesPrimitive data-slot="ripple-button-ripple" {...props} />;
}

export { RippleButton, RippleButtonRipples };
export type { RippleButtonProps, RippleButtonRipplesProps };
