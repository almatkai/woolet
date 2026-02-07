"use client"

import { motion, type Transition, type UseInViewOptions, useInView } from "motion/react"
import * as React from "react"

type WritingTextProps = Omit<React.ComponentProps<"span">, "children"> & {
  transition?: Transition
  inView?: boolean
  inViewMargin?: UseInViewOptions["margin"]
  inViewOnce?: boolean
  spacing?: number | string
  text: string
}

function WritingText({
  ref,
  inView = false,
  inViewMargin = "0px",
  inViewOnce = true,
  spacing = 0,
  text,
  transition = { type: "spring", bounce: 0, duration: 2, delay: 0.5 },
  ...props
}: WritingTextProps) {
  const localRef = React.useRef<HTMLSpanElement>(null)
  React.useImperativeHandle(ref as any, () => localRef.current as HTMLSpanElement)

  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  })
  const isInView = !inView || inViewResult

  const words = React.useMemo(() => text.split(" "), [text])

  return (
    <span data-slot="writing-text" ref={localRef} {...(props as any)}>
      {words.map((word, index) => (
        <motion.span
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          className="inline-block will-change-transform will-change-opacity"
          initial={{ opacity: 0, y: 10 }}
          key={index}
          style={{ marginRight: spacing }}
          transition={{
            ...transition,
            delay: (transition?.delay ?? 0) + (index * 0.1),
          }}
        >
          {word}{" "}
        </motion.span>
      ))}
    </span>
  )
}

export { WritingText, type WritingTextProps }
export default WritingText
