"use client"

import { IconButton as IconButtonPrimitive, IconButtonParticles } from "@animate-ui/react/primitives/buttons/icon"
import { type VariantProps } from "class-variance-authority"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Official press and particle behavior with the site's shared button variants. */
function IconButton({ className, variant = "ghost", size = "icon", type = "button", ...props }: React.ComponentProps<typeof IconButtonPrimitive> & VariantProps<typeof buttonVariants>) {
  return <IconButtonPrimitive type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { IconButton, IconButtonParticles }
