"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface GridPatternProps {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    strokeDasharray?: string | number;
    numSquares?: number;
    className?: string;
    maxOpacity?: number;
    duration?: number;
}

export function AnimatedGridPattern({
    width = 40,
    height = 40,
    x = -1,
    y = -1,
    strokeDasharray = 0,
    numSquares = 50,
    className,
    maxOpacity = 0.5,
    duration = 4,
    ...props
}: GridPatternProps) {
    const id = useId();
    const containerRef = useRef<SVGSVGElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [squares, setSquares] = useState<{ id: number; pos: number[] }[]>([]);
    const shouldReduceMotion = useReducedMotion();

    function getPos() {
        return [
            Math.floor((Math.random() * dimensions.width) / width),
            Math.floor((Math.random() * dimensions.height) / height),
        ];
    }

    function generateSquares(count: number) {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            pos: getPos(),
        }));
    }

    const updateSquarePosition = (id: number) => {
        setSquares((currentSquares) =>
            currentSquares.map((sq) =>
                sq.id === id
                    ? {
                        ...sq,
                        pos: getPos(),
                    }
                    : sq
            )
        );
    };

    useEffect(() => {
        const handle = setTimeout(() => {
            if (dimensions.width && dimensions.height) {
                setSquares(generateSquares(numSquares));
            }
        }, 0);
        return () => clearTimeout(handle);
    }, [dimensions, numSquares]);

    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    return (
        <svg
            ref={containerRef}
            aria-hidden="true"
            className={cn(
                "pointer-events-none absolute inset-0 h-full w-full fill-white/[0.02] stroke-white/[0.04]",
                className
            )}
            {...props}
        >
            <defs>
                <pattern
                    id={id}
                    width={width}
                    height={height}
                    patternUnits="userSpaceOnUse"
                    x={x}
                    y={y}
                >
                    <path
                        d={`M.5 ${height}V.5H${width}`}
                        fill="none"
                        strokeDasharray={strokeDasharray}
                    />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${id})`} />
            <svg x={x} y={y} className="overflow-visible">
                {squares.map(({ pos: [x, y], id }, index) => (
                    <motion.rect
                        initial={{ opacity: 0 }}
                        animate={shouldReduceMotion ? { opacity: maxOpacity * 0.5 } : { opacity: maxOpacity }}
                        transition={shouldReduceMotion ? { duration: 0 } : {
                            duration,
                            repeat: Infinity,
                            delay: index * 0.1,
                            repeatType: "reverse",
                        }}
                        onAnimationComplete={() => !shouldReduceMotion && updateSquarePosition(id)}
                        key={`${x}-${y}-${index}`}
                        width={width - 1}
                        height={height - 1}
                        x={x! * width + 1}
                        y={y! * height + 1}
                        fill="currentColor"
                        strokeWidth="0"
                    />
                ))}
            </svg>
        </svg>
    );
}

export default AnimatedGridPattern;
