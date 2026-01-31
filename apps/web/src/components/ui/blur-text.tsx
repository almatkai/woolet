"use client"

import { motion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"

interface BlurTextProps {
    text?: string
    delay?: number
    className?: string
    animateBy?: "words" | "letters"
    direction?: "top" | "bottom"
    threshold?: number
    rootMargin?: string
    onAnimationComplete?: () => void
}

const BlurText: React.FC<BlurTextProps> = ({
    text = "",
    delay = 200,
    className = "",
    animateBy = "words",
    direction = "top",
    threshold = 0.1,
    rootMargin = "0px",
    onAnimationComplete,
}) => {
    const elements = animateBy === "words" ? text.split(" ") : text.split("")
    const [inView, setInView] = useState(false)
    const ref = useRef<HTMLParagraphElement>(null)

    useEffect(() => {
        if (!ref.current) {
            return
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setInView(true)
                    observer.unobserve(ref.current as Element)
                }
            },
            { threshold, rootMargin },
        )
        observer.observe(ref.current)
        return () => observer.disconnect()
    }, [threshold, rootMargin])

    const defaultFrom = useMemo(
        () =>
            direction === "top"
                ? { filter: "blur(10px)", opacity: 0, y: -30 }
                : { filter: "blur(10px)", opacity: 0, y: 30 },
        [direction],
    )

    const defaultTo = useMemo(
        () => ({ filter: "blur(0px)", opacity: 1, y: 0 }),
        [],
    )

    return (
        <p className={`blur-text ${className} flex flex-wrap`} ref={ref}>
            {elements.map((segment, index) => (
                <motion.span
                    animate={inView ? defaultTo : defaultFrom}
                    initial={defaultFrom}
                    key={index}
                    onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
                    style={{
                        display: "inline-block",
                        willChange: "transform, filter, opacity",
                    }}
                    transition={{
                        duration: 0.5,
                        delay: (index * delay) / 1000,
                        ease: "easeOut",
                    }}
                >
                    {segment === " " ? "\u00A0" : segment}
                    {animateBy === "words" && index < elements.length - 1 && "\u00A0"}
                </motion.span>
            ))}
        </p>
    )
}

export default BlurText
export { BlurText }
