"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import Particles from "./Particles";
import AnimatedGridPattern from "./AnimatedGridPattern";
import Spotlight from "./Spotlight";

export function HeroBackground() {
  const shouldReduceMotion = useReducedMotion();
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(mq.matches);

    if ("addEventListener" in mq) {
      mq.addEventListener("change", handleChange);
      return () => mq.removeEventListener("change", handleChange);
    }

    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  

  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      {/* Particles */}
      <Particles
        className="absolute inset-0"
        quantity={60}
        ease={80}
        color="#ffffff"
        size={0.5}
      />

      {/* Animated Grid Pattern */}
      <AnimatedGridPattern
        numSquares={30}
        maxOpacity={0.1}
        duration={3}
        className="absolute inset-0"
      />

      {/* Spotlight */}
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20 h-screen"
        fill="white"
      />
    </div>
  );
}

export default HeroBackground;
