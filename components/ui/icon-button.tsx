"use client";

import { IconButton as IconButtonPrimitive, IconButtonParticles } from "@animate-ui/react/primitives/buttons/icon";
import { type VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { ActionIconContext, useActionIcon } from "@/components/ui/action-icon";
import { cn } from "@/lib/utils";

/** Official press and particle behavior with the site's shared button variants. */
function IconButton({
  className,
  variant = "ghost",
  size = "icon",
  type = "button",
  children,
  onFocus,
  onBlur,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  ...props
}: Omit<React.ComponentProps<typeof IconButtonPrimitive>, "asChild" | "children"> &
  VariantProps<typeof buttonVariants> & { children?: React.ReactNode }) {
  const icon = useActionIcon();
  return (
    <IconButtonPrimitive
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
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
    >
      <ActionIconContext.Provider value={icon.active}>{children}</ActionIconContext.Provider>
    </IconButtonPrimitive>
  );
}

export { IconButton, IconButtonParticles };
