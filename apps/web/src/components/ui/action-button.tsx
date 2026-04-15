import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Standard Action Button used in Page Headers and common UI areas.
 * Matches the design language of the platform (e.g. Credits page).
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "sm", ...props }, ref) => {
        return (
            <Button
                ref={ref}
                variant={variant}
                size={size}
                className={cn(
                    "gap-2 px-4 h-8 md:h-9 rounded-full font-semibold shadow-none transition-all active:scale-[0.98] border-none whitespace-nowrap text-xs md:text-sm",
                    variant === 'default' && "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90",
                    variant === 'secondary' && "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]",
                    variant === 'outline' && "bg-transparent border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
                    className
                )}
                {...props}
            />
        );
    }
);

ActionButton.displayName = "ActionButton";
