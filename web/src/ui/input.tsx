// Standalone fields share one fine frame; focus uses a background tint.
import * as React from "react"

import { FIELD } from "@/shared/designTokens"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        FIELD.base,
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-8 w-full min-w-0 px-2.5 py-1 text-[13px] transition-[color,background-color,border-color] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[12px] file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:bg-[var(--surface-strong)]",
        "aria-invalid:bg-destructive/10 dark:aria-invalid:bg-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
