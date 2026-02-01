"use client";

import Particles from "./Particles";
import AnimatedGridPattern from "./AnimatedGridPattern";
import Spotlight from "./Spotlight";

export function HeroBackground() {
  return (
    <>
      {/* Particles */}
      <Particles
        className="absolute inset-0"
        quantity={80}
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
    </>
  );
}

export default HeroBackground;
