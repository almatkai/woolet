import * as React from "react"

import { cn } from "@/lib/utils"

const DATE_INPUT_TYPES = new Set(["date", "datetime-local", "month", "week", "time"])

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onClick, ...props }, ref) => {
    const isDateInput = type ? DATE_INPUT_TYPES.has(type) : false

    const handleClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
      onClick?.(event)
      if (event.defaultPrevented) return
      if (!isDateInput || props.disabled || props.readOnly) return

      ;(event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background/50 dark:bg-muted/20 px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          isDateInput && "pr-3 dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none",
          className
        )}
        ref={ref}
        onClick={handleClick}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
