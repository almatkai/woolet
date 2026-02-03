import React, { useState, ReactNode } from 'react';
import { useSubscription } from '@clerk/clerk-react/experimental';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CustomPricing } from './CustomPricing';
import { PricingContext } from './PricingContext';

interface PricingProviderProps {
    children: ReactNode;
}

export { usePricing } from './PricingContext';

export function PricingProvider({ children }: PricingProviderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { data: subscription, isLoading } = useSubscription();

    const openPricing = () => setIsOpen(true);
    const closePricing = () => setIsOpen(false);

    // Get the first active paid plan ID
    const activePlanId = subscription?.subscriptionItems?.[0]?.plan?.id || null;
    const planName = subscription?.subscriptionItems?.[0]?.plan?.name || null;
    
    // Debug logging - expand subscriptionItems details
    console.log('[PricingProvider] Debug:', {
        isLoading,
        subscription,
        subscriptionItems: subscription?.subscriptionItems,
        firstItem: subscription?.subscriptionItems?.[0],
        plan: subscription?.subscriptionItems?.[0]?.plan,
        planName,
        activePlanId,
        nextPayment: subscription?.nextPayment,
        status: subscription?.status,
        eligibleForFreeTrial: subscription?.eligibleForFreeTrial
    });
    
    // Check if user is on a paid plan
    // A user is considered paid if they have a plan AND it's not the "Free" plan
    const isPaid = !!activePlanId && planName?.toLowerCase() !== 'free';

    console.log('[PricingProvider] isPaid result:', isPaid);

    return (
        <PricingContext.Provider value={{ isOpen, openPricing, closePricing, activePlanId, isPaid, isLoading }}>
            {children}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-7xl w-full p-0 overflow-hidden bg-background border-none shadow-2xl h-[90vh]">
                    <div className="h-full overflow-y-auto">
                        <CustomPricing />
                    </div>
                </DialogContent>
            </Dialog>
        </PricingContext.Provider>
    );
}
