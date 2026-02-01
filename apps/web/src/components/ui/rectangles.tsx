import React, { ComponentPropsWithoutRef, CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface RectanglesProps extends ComponentPropsWithoutRef<"div"> {
    mainRectSize?: number
    mainRectOpacity?: number
    numRects?: number
}

export const Rectangles = React.memo(function Rectangles({
    mainRectSize = 180,
    mainRectOpacity = 0.24,
    numRects = 6,
    className,
    ...props
}: RectanglesProps) {
    return (
        <div
            className={cn(
                "pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,white,transparent)] select-none",
                className
            )}
            {...props}
        >
            {Array.from({ length: numRects }, (_, i) => {
                const size = mainRectSize + i * 80
                const opacity = mainRectOpacity - i * 0.03
                const animationDelay = `${i * 0.08}s`

                return (
                    <div
                        key={i}
                        className="animate-rectangles absolute border border-white/20 shadow-xl"
                        style={
                            {
                                "--i": i,
                                width: `${size}px`,
                                height: `${size}px`,
                                opacity,
                                animationDelay,
                                borderRadius: "16px",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%) rotate(45deg) scale(1)",
                            } as CSSProperties
                        }
                    />
                )
            })}
        </div>
    )
})

Rectangles.displayName = "Rectangles"
