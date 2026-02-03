import { TRPCError } from '@trpc/server';
import { 
    TIER_LIMITS, 
    hasFeature, 
    getSubscriptionConfig, 
    canAccessFeature,
    FeatureFlags,
    SubscriptionTier
} from '@woolet/shared';

type TierKey = keyof typeof TIER_LIMITS;

/**
 * @deprecated Use hasFeature from @woolet/shared directly
 */
export function checkFeatureAccess(
    userTier: string, 
    feature: 'currencyWidget' | 'aiMarketDigest'
): boolean {
    const featureKey: keyof FeatureFlags = feature === 'currencyWidget' 
        ? 'hasCurrencyWidget' 
        : 'hasAiMarketDigest';
    return hasFeature(userTier, featureKey);
}

/**
 * Check feature access with new unified config
 */
export function checkFeature(
    userTier: string,
    feature: keyof FeatureFlags
): { allowed: boolean; reason?: string; upgradeTarget?: SubscriptionTier } {
    return canAccessFeature(userTier, feature);
}

export function throwUpgradeError(feature: string, currentTier: string) {
    const config = getSubscriptionConfig(currentTier);
    const upgradeTarget = config.tier === 'free' ? 'Pro ($8/month)' : 'Premium ($20/month)';
    throw new TRPCError({
        code: 'FORBIDDEN',
        message: `${feature} is locked. Upgrade to ${upgradeTarget} to unlock this feature.`
    });
}

export function getAiDigestLength(userTier: string): 'short' | 'complete' | null {
    const config = getSubscriptionConfig(userTier);
    if (!config.features.hasAiMarketDigest) return null;
    return config.display.aiDigestLength;
}
