"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  limitations?: string[];
  cta: string;
  href: string;
  popular: boolean;
}

interface PricingCardsProps {
  plans: Plan[];
}

export function PricingCards({ plans }: PricingCardsProps) {
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
      className="relative grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-6"
    >
      {plans.map((plan, index) => (
        <motion.div
          key={plan.name}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={shouldReduceMotion ? { duration: 0 } : {
            duration: 0.6,
            delay: index * 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          className={cn(
            "relative rounded-2xl p-8 transition-all duration-500",
            "bg-white/[0.02] backdrop-blur-sm border",
            plan.popular ? "border-white/30" : "border-white/10",
            hoveredIndex === index && "border-white/40"
          )}
          style={{
            boxShadow: hoveredIndex === index && !shouldReduceMotion
              ? `0 0 60px rgba(255,255,255,0.07), inset 0 0 40px rgba(255,255,255,0.02)`
              : plan.popular
                ? `0 0 40px rgba(255,255,255,0.05)`
                : undefined,
            transform: hoveredIndex === index && !shouldReduceMotion ? 'translateY(-8px)' : undefined,
          }}
        >
          {/* Animated gradient border for popular plan */}
          {plan.popular && !shouldReduceMotion && (
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-white/20 via-white/5 to-white/20 animate-border-shimmer" />
          )}

          {/* Inner content wrapper */}
          <div className="relative">
            {/* Popular badge */}
            {plan.popular && (
              <motion.div
                className="absolute -top-12 inset-x-0 flex justify-center"
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : undefined}
                transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.3, duration: 0.4 }}
              >
                <span className="px-4 py-1.5 bg-white text-slate-900 text-sm font-semibold rounded-full shadow-lg shadow-white/20 whitespace-nowrap">
                  Most Popular
                </span>
              </motion.div>
            )}

            {/* Plan header */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <motion.span
                  className="text-4xl font-bold text-white"
                  initial={shouldReduceMotion ? {} : { scale: 0.9 }}
                  animate={hoveredIndex === index ? { scale: 1.05 } : { scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {plan.price}
                </motion.span>
                <span className="text-slate-400">{plan.period}</span>
              </div>
              <p className="text-slate-400 text-sm mt-2">{plan.description}</p>
            </div>

            {/* Features */}
            <ul className="space-y-3 mb-4">
              {plan.features.map((feature, i) => (
                <motion.li
                  key={i}
                  className="flex items-start gap-3"
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -10 }}
                  animate={isInView ? { opacity: 1, x: 0 } : undefined}
                  transition={shouldReduceMotion ? { duration: 0 } : { delay: index * 0.1 + i * 0.03, duration: 0.3 }}
                >
                  <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-slate-300 text-sm">{feature}</span>
                </motion.li>
              ))}
            </ul>

            {/* Limitations */}
            {plan.limitations && plan.limitations.length > 0 && (
              <ul className="space-y-2 mb-8 pt-4 border-t border-white/10">
                {plan.limitations.map((limitation, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-slate-500 text-sm">{limitation}</span>
                  </li>
                ))}
              </ul>
            )}

            {(!plan.limitations || plan.limitations.length === 0) && (
              <div className="mb-8" />
            )}

            {/* CTA */}
            <motion.a
              href={plan.href}
              className={cn(
                "block w-full text-center py-3 px-6 rounded-full font-medium transition-all duration-300",
                plan.popular
                  ? "bg-white text-slate-900 hover:bg-white/90 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                  : "bg-white/10 text-white hover:bg-white/20"
              )}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
            >
              {plan.cta}
            </motion.a>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default PricingCards;
