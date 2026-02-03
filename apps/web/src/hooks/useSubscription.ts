import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
    getSubscriptionConfig,
    hasFeature as hasFeatureFn,
    getDataLimit as getDataLimitFn,
    canAccessFeature,
    formatLimit,
    formatPrice,
    getUpgradeTier,
    isAtLeastTier as isAtLeastTierFn,
    SubscriptionTier,
    FeatureFlags,
    DataLimits,
} from '@woolet/shared';

/**
 * Main subscription hook - returns full config and helpers
 */
export function useSubscription() {
    const { data: limitsData, isLoading } = trpc.bank.getLimitsAndUsage.useQuery();
    
    const tier = (limitsData?.tier || 'free') as SubscriptionTier;
    const config = useMemo(() => getSubscriptionConfig(tier), [tier]);

    return {
        tier,
        config,
        isLoading,
        isPaid: tier !== 'free',
        isPremium: tier === 'premium',
        canUpgrade: limitsData?.canUpgrade ?? true,
        usage: limitsData?.usage,
        // Direct access to structured data
        display: config.display,
        features: config.features,
        credits: config.credits,
        limits: config.limits,
    };
}

/**
 * Check if user can access a specific feature
 */
export function useCanAccess(feature: keyof FeatureFlags) {
    const { tier, isLoading } = useSubscription();
    
    const result = useMemo(() => {
        if (isLoading) return { allowed: false, loading: true, reason: undefined, upgradeTarget: undefined };
        return { ...canAccessFeature(tier, feature), loading: false };
    }, [tier, feature, isLoading]);

    return result;
}

/**
 * Check if user has a feature flag enabled
 */
export function useHasFeature(feature: keyof FeatureFlags): boolean {
    const { tier, isLoading } = useSubscription();
    if (isLoading) return false;
    return hasFeatureFn(tier, feature);
}

/**
 * Get a specific data limit
 */
export function useDataLimit(limitKey: keyof DataLimits): number {
    const { tier } = useSubscription();
    return getDataLimitFn(tier, limitKey);
}

/**
 * Get formatted data limit for display
 */
export function useFormattedLimit(limitKey: keyof DataLimits): string {
    const limit = useDataLimit(limitKey);
    return formatLimit(limit);
}

/**
 * Check if user is at least a certain tier
 */
export function useIsAtLeastTier(requiredTier: SubscriptionTier): boolean {
    const { tier, isLoading } = useSubscription();
    if (isLoading) return false;
    return isAtLeastTierFn(tier, requiredTier);
}

/**
 * Get upgrade information
 */
export function useUpgradeInfo() {
    const { tier, config } = useSubscription();
    
    const upgradeTier = getUpgradeTier(tier);
    const upgradeConfig = upgradeTier ? getSubscriptionConfig(upgradeTier) : null;

    return {
        canUpgrade: upgradeTier !== null,
        upgradeTier,
        upgradeConfig,
        currentTier: tier,
        currentConfig: config,
        upgradePrice: upgradeConfig ? formatPrice(upgradeConfig.display.priceMonthly) : null,
        upgradePriceYearly: upgradeConfig?.display.priceYearly 
            ? formatPrice(upgradeConfig.display.priceYearly) 
            : null,
    };
}

/**
 * Hook for feature-gated components
 * Returns render helpers for locked/unlocked states
 */
export function useFeatureGate(feature: keyof FeatureFlags) {
    const access = useCanAccess(feature);
    const { upgradeConfig, upgradeTier } = useUpgradeInfo();

    return {
        ...access,
        isLocked: !access.allowed && !access.loading,
        upgradeMessage: access.reason,
        upgradeTier,
        upgradePrice: upgradeConfig ? formatPrice(upgradeConfig.display.priceMonthly) : null,
    };
}

/**
 * Get transaction history date filter based on tier
 */
export function useTransactionHistoryFilter(): Date | null {
    const historyDays = useDataLimit('transactionHistoryDays');
    
    if (historyDays === Infinity) return null;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - historyDays);
    return cutoffDate;
}

/**
 * Get all subscription configs for pricing page
 */
export function useAllSubscriptionConfigs() {
    return useMemo(() => ({
        free: getSubscriptionConfig('free'),
        pro: getSubscriptionConfig('pro'),
        premium: getSubscriptionConfig('premium'),
    }), []);
}
