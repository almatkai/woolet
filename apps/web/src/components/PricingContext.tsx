import { createContext, useContext } from 'react';

export interface PricingContextType {
    isOpen: boolean;
    openPricing: () => void;
    closePricing: () => void;
    activePlanId: string | null;
    isPaid: boolean;
    isLoading: boolean;
}

export const PricingContext = createContext<PricingContextType | undefined>(undefined);

export function usePricing() {
    const context = useContext(PricingContext);
    if (context === undefined) {
        throw new Error('usePricing must be used within a PricingProvider');
    }
    return context;
}
