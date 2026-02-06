"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

interface MorphingTextProps {
  texts: string[];
  className?: string;
  duration?: number;
}

export default function MorphingText({
  texts,
  className = "",
  duration = 2500,
}: MorphingTextProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, duration);

    return () => clearInterval(interval);
  }, [texts.length, duration]);

  if (shouldReduceMotion) {
    return <span className={className}>{texts[currentIndex]}</span>;
  }

  return (
    <span className={cn("relative inline-block", className)}>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={currentIndex}
          initial={{
            opacity: 0,
            y: 20,
            filter: "blur(8px)",
          }}
          animate={{
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
          }}
          exit={{
            opacity: 0,
            y: -20,
            filter: "blur(8px)",
          }}
          transition={{
            duration: 1,
            ease: [0.16, 1, 0.3, 1]
          }}
          className="inline-block"
        >
          {texts[currentIndex]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
