import { TRPCError } from '@trpc/server';
import { TIER_LIMITS } from '../routers/bank';

type TierKey = keyof typeof TIER_LIMITS;

export function checkFeatureAccess(
    userTier: string, 
    feature: 'currencyWidget' | 'aiMarketDigest'
): boolean {
    const tier = (userTier || 'free') as TierKey;
    const limits = TIER_LIMITS[tier];
    
    if (feature === 'currencyWidget') {
        return limits.hasCurrencyWidget;
    }
    if (feature === 'aiMarketDigest') {
        return limits.hasAiMarketDigest;
    }
    
    return false;
}

export function throwUpgradeError(feature: string, currentTier: string) {
    const upgradeTarget = currentTier === 'free' ? 'Pro ($8/month)' : 'Premium ($20/month)';
    throw new TRPCError({
        code: 'FORBIDDEN',
        message: `${feature} is locked. Upgrade to ${upgradeTarget} to unlock this feature.`
    });
}

export function getAiDigestLength(userTier: string): 'short' | 'complete' | null {
    const tier = (userTier || 'free') as TierKey;
    const limits = TIER_LIMITS[tier];
    
    if (!limits.hasAiMarketDigest) return null;
    return 'aiDigestLength' in limits ? limits.aiDigestLength as 'short' | 'complete' : null;
}
