import React from 'react';
import { motion } from 'framer-motion';
import { usePricing } from '@/components/PricingContext';
import { useUser } from '@clerk/clerk-react';
import { Sparkles, ArrowRight, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PricingCtaBannerProps {
  className?: string;
  variant?: 'sidebar' | 'inline' | 'card';
}

export function PricingCtaBanner({ className, variant = 'sidebar' }: PricingCtaBannerProps) {
  const { isPaid, openPricing, isLoading } = usePricing();

  if (isLoading || isPaid) return null;

  const handleUpgrade = () => {
    openPricing();
  };

  if (variant === 'sidebar') {
    return (
      <div className={cn(
        "relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-purple-500/10 p-4",
        className
      )}>
        {/* Animated background effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-purple-500/5 animate-pulse" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500"
              animate={{
                scale: [1, 1.05, 1],
                boxShadow: [
                  "0 0 0 rgba(245, 158, 11, 0)",
                  "0 0 12px rgba(245, 158, 11, 0.5)",
                  "0 0 0 rgba(245, 158, 11, 0)"
                ]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <Crown className="h-4 w-4 text-white" />
            </motion.div>
            <span className="text-sm font-semibold text-foreground">Become Pro</span>
          </div>

          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Unlock unlimited banks, accounts, and AI questions with Pro or Premium.
          </p>

          <Button
            size="sm"
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 text-xs font-medium group"
            onClick={handleUpgrade}
          >
            Upgrade
            <ArrowRight className="h-3.5 w-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform" />
          </Button>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn(
        "flex items-center gap-4 p-4 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10",
        className
      )}>
        <div className="p-2 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shrink-0">
          <Crown className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            You're on the Free plan
          </p>
          <p className="text-xs text-muted-foreground">
            Upgrade to unlock unlimited features and AI assistance
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 group"
          onClick={handleUpgrade}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 mr-1.5 transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1"
          >
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
          Upgrade
        </Button>
      </div>
    );
  }

  // Card variant
  return (
    <div className={cn(
      "rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-purple-500/10 p-5",
      className
    )}>
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shrink-0">
          <Crown className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground mb-1">
            Upgrade Your Experience
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            You're currently on the Free plan. Upgrade to Pro or Premium to unlock unlimited banks,
            accounts, currencies, and get more AI questions per day.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
              onClick={handleUpgrade}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              View Plans
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}