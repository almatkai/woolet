"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";

interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface FeatureGridProps {
  features: Feature[];
}

export function FeatureGrid({ features }: FeatureGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  const shouldReduceMotion = useReducedMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
    >
      {features.map((feature, index) => (
        <motion.div
          key={index}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={shouldReduceMotion ? { duration: 0 } : {
            duration: 0.5,
            delay: index * 0.05,
            ease: [0.16, 1, 0.3, 1],
          }}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          className={cn(
            "feature-card group relative rounded-2xl p-6 cursor-pointer transition-all duration-300",
            "bg-white/[0.02] backdrop-blur-sm border border-white/10",
            "hover:border-white/25 hover:bg-white/[0.05]"
          )}
          style={{
            boxShadow: hoveredIndex === index && !shouldReduceMotion
              ? `0 0 40px rgba(255,255,255,0.05), inset 0 0 30px rgba(255,255,255,0.02)`
              : undefined,
          }}
        >
          {/* Icon */}
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-300",
              "bg-white/5 group-hover:bg-white/10 group-hover:scale-110"
            )}
          >
            <div
              className="text-white/70 group-hover:text-white transition-colors duration-300"
              dangerouslySetInnerHTML={{ __html: feature.icon }}
            />
          </div>

          {/* Content */}
          <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-white transition-colors duration-300">
            {feature.title}
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors duration-300">
            {feature.description}
          </p>

          {/* Hover arrow */}
          <motion.div
            className="absolute bottom-6 right-6 text-white/50"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: hoveredIndex === index ? 1 : 0, x: hoveredIndex === index ? 0 : -10 }}
            transition={{ duration: 0.2 }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

export default FeatureGrid;
