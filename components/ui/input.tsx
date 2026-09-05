import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-[10px] border border-input bg-card px-3.5 py-2 text-base text-foreground shadow-none transition-[border-color,box-shadow,background-color] duration-200 outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/10",
        className
      )}
      {...props}
    />
  )
}

export { Input }
