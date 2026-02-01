import { createFileRoute } from '@tanstack/react-router';
import { PricingSection } from '@/components/landing/PricingSection';

export const Route = (createFileRoute as any)('/pricing')({
    component: PricingPage,
});

export function PricingPage() {
    return (
        <div className="min-h-screen">
            <PricingSection />
        </div>
    );
}
