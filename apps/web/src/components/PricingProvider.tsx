import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useSubscription } from '@clerk/clerk-react/experimental';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CustomPricing } from './CustomPricing';

interface PricingContextType {
    isOpen: boolean;
    openPricing: () => void;
    closePricing: () => void;
    activePlanId: string | null;
    isPaid: boolean;
    isLoading: boolean;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export function usePricing() {
    const context = useContext(PricingContext);
    if (context === undefined) {
        throw new Error('usePricing must be used within a PricingProvider');
    }
    return context;
}

interface PricingProviderProps {
    children: ReactNode;
}

export function PricingProvider({ children }: PricingProviderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { data: subscription, isLoading } = useSubscription();

    const openPricing = () => setIsOpen(true);
    const closePricing = () => setIsOpen(false);

    // Get the first active paid plan ID
    const activePlanId = subscription?.subscriptionItems?.[0]?.plan?.id || null;
    const isPaid = !!activePlanId;

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
