import React from 'react';
import { HeroSection } from './HeroSection';
import { FeaturesGrid } from './FeaturesGrid';
import { StatsCounter } from './StatsCounter';
import { DemoChart } from './DemoChart';
import { ScrollMarquee } from './ScrollMarquee';
import { PricingSection } from './PricingSection';
import { CTASection } from './CTASection';
import { FloatingIcons } from './FloatingIcons';

export function LandingPage() {
    return (
        <div className="w-full overflow-hidden relative">
            <FloatingIcons />
            <HeroSection />
            <FeaturesGrid />
            <StatsCounter />
            <DemoChart />
            <ScrollMarquee />
            <PricingSection />
            <CTASection />
        </div>
    );
}

export default LandingPage;
