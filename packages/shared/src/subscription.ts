/**
 * Subscription Configuration
 * 
 * Single source of truth for all subscription tiers, features, credits, and limits.
 * Used by both frontend and backend for consistent feature gating.
 */

// =============================================================================
// Types
// =============================================================================

export type SubscriptionTier = 'free' | 'pro' | 'premium';

export type CreditPeriod = 'daily' | 'weekly' | 'monthly' | 'lifetime';

/**
 * Features that can be enabled/disabled per tier (display flags)
 */
export interface FeatureFlags {
    // AI Features
    hasAiChat: boolean;
    hasAiMarketDigest: boolean;
    hasAiSpendingAnalysis: boolean;
    hasAiDigestRegeneration: boolean;

    // Banking Features
    hasCurrencyWidget: boolean;
    hasUnlimitedBanks: boolean;
    hasUnlimitedAccounts: boolean;
    hasExportData: boolean;

    // Investing Features
    hasAdvancedCharts: boolean;
    hasPortfolioBenchmark: boolean;
    hasStockAlerts: boolean;

    // General
    hasPrioritySupport: boolean;
    hasCustomCategories: boolean;
}

/**
 * Credit-based limits (consumable resources)
 */
export interface CreditLimits {
    aiChat: CreditConfig;
    aiDigestRegeneration: CreditConfig;
    stockAlerts: CreditConfig;
    dataExports: CreditConfig;
}

export interface CreditConfig {
    /** Credit limit for the period */
    limit: number;
    /** Reset period */
    period: CreditPeriod;
    /** For free tier, we might have a separate lifetime limit */
    lifetimeLimit?: number;
}

/**
 * Data access limits (how much historical data can be accessed)
 */
export interface DataLimits {
    /** Transaction history in days (Infinity = unlimited) */
    transactionHistoryDays: number;
    /** Max banks user can create */
    maxBanks: number;
    /** Max accounts per bank */
    maxAccountsPerBank: number;
    /** Max currencies per account */
    maxCurrenciesPerAccount: number;
    /** Max stocks in portfolio */
    maxStocks: number;
    /** Max chat sessions stored */
    maxChatSessions: number;
}

/**
 * Display configuration for UI
 */
export interface DisplayConfig {
    /** Tier display name */
    name: string;
    /** Short description */
    description: string;
    /** Monthly price in cents (0 for free) */
    priceMonthly: number;
    /** Yearly price in cents (0 for free, null if no yearly option) */
    priceYearly: number | null;
    /** Badge color for UI */
    badgeColor: string;
    /** AI digest length: short (200-300 words), complete (1000+ words) */
    aiDigestLength: 'short' | 'complete' | null;
    /** Features to highlight in pricing page */
    highlights: string[];
}

/**
 * Complete subscription configuration for a tier
 */
export interface SubscriptionConfig {
    tier: SubscriptionTier;
    display: DisplayConfig;
    features: FeatureFlags;
    credits: CreditLimits;
    limits: DataLimits;
}

// =============================================================================
// Tier Configurations
// =============================================================================

export const FREE_CONFIG: SubscriptionConfig = {
    tier: 'free',
    display: {
        name: 'Free',
        description: 'Get started with basic finance tracking',
        priceMonthly: 0,
        priceYearly: 0,
        badgeColor: 'gray',
        aiDigestLength: null,
        highlights: [
            '2 banks, 2 accounts each',
            '90 days transaction history',
            '3 lifetime AI questions',
            '5 stocks in portfolio',
        ],
    },
    features: {
        hasAiChat: true, // Limited by lifetime credits
        hasAiMarketDigest: false,
        hasAiSpendingAnalysis: false,
        hasAiDigestRegeneration: false,
        hasCurrencyWidget: false,
        hasUnlimitedBanks: false,
        hasUnlimitedAccounts: false,
        hasExportData: false,
        hasAdvancedCharts: false,
        hasPortfolioBenchmark: false,
        hasStockAlerts: false,
        hasPrioritySupport: false,
        hasCustomCategories: false,
    },
    credits: {
        aiChat: { limit: 0, period: 'daily', lifetimeLimit: 3 },
        aiDigestRegeneration: { limit: 0, period: 'daily' },
        stockAlerts: { limit: 0, period: 'monthly' },
        dataExports: { limit: 0, period: 'monthly' },
    },
    limits: {
        transactionHistoryDays: 90,
        maxBanks: 2,
        maxAccountsPerBank: 2,
        maxCurrenciesPerAccount: 2,
        maxStocks: 5,
        maxChatSessions: 5,
    },
};

export const PRO_CONFIG: SubscriptionConfig = {
    tier: 'pro',
    display: {
        name: 'Pro',
        description: 'For serious personal finance management',
        priceMonthly: 800, // $8/month in cents
        priceYearly: 6400, // $64/year (20% discount)
        badgeColor: 'blue',
        aiDigestLength: 'short',
        highlights: [
            'Unlimited banks & accounts',
            'Full transaction history',
            '5 AI questions per day',
            'AI Market Insights (short)',
            '20 stocks in portfolio',
            'Currency widget',
        ],
    },
    features: {
        hasAiChat: true,
        hasAiMarketDigest: true,
        hasAiSpendingAnalysis: true,
        hasAiDigestRegeneration: false,
        hasCurrencyWidget: true,
        hasUnlimitedBanks: true,
        hasUnlimitedAccounts: true,
        hasExportData: true,
        hasAdvancedCharts: true,
        hasPortfolioBenchmark: true,
        hasStockAlerts: false,
        hasPrioritySupport: false,
        hasCustomCategories: true,
    },
    credits: {
        aiChat: { limit: 5, period: 'daily' },
        aiDigestRegeneration: { limit: 0, period: 'daily' },
        stockAlerts: { limit: 0, period: 'monthly' },
        dataExports: { limit: 5, period: 'monthly' },
    },
    limits: {
        transactionHistoryDays: Infinity,
        maxBanks: Infinity,
        maxAccountsPerBank: Infinity,
        maxCurrenciesPerAccount: 5,
        maxStocks: 20,
        maxChatSessions: 50,
    },
};

export const PREMIUM_CONFIG: SubscriptionConfig = {
    tier: 'premium',
    display: {
        name: 'Premium',
        description: 'Full power for power users',
        priceMonthly: 2000, // $20/month in cents
        priceYearly: 16800, // $168/year (30% discount)
        badgeColor: 'purple',
        aiDigestLength: 'complete',
        highlights: [
            'Everything in Pro',
            '25 AI questions per day',
            'AI Market Insights (full)',
            '5 custom digest regenerations/day',
            '1000 stocks in portfolio',
            'Stock price alerts',
            'Priority support',
        ],
    },
    features: {
        hasAiChat: true,
        hasAiMarketDigest: true,
        hasAiSpendingAnalysis: true,
        hasAiDigestRegeneration: true,
        hasCurrencyWidget: true,
        hasUnlimitedBanks: true,
        hasUnlimitedAccounts: true,
        hasExportData: true,
        hasAdvancedCharts: true,
        hasPortfolioBenchmark: true,
        hasStockAlerts: true,
        hasPrioritySupport: true,
        hasCustomCategories: true,
    },
    credits: {
        aiChat: { limit: 25, period: 'daily' },
        aiDigestRegeneration: { limit: 5, period: 'daily' },
        stockAlerts: { limit: 10, period: 'monthly' },
        dataExports: { limit: Infinity, period: 'monthly' },
    },
    limits: {
        transactionHistoryDays: Infinity,
        maxBanks: Infinity,
        maxAccountsPerBank: Infinity,
        maxCurrenciesPerAccount: Infinity,
        maxStocks: 1000,
        maxChatSessions: Infinity,
    },
};

// =============================================================================
// Config Map & Helpers
// =============================================================================

export const SUBSCRIPTION_CONFIGS: Record<SubscriptionTier, SubscriptionConfig> = {
    free: FREE_CONFIG,
    pro: PRO_CONFIG,
    premium: PREMIUM_CONFIG,
};

/**
 * Get subscription config for a tier
 */
export function getSubscriptionConfig(tier: SubscriptionTier | string): SubscriptionConfig {
    const validTier = (tier in SUBSCRIPTION_CONFIGS ? tier : 'free') as SubscriptionTier;
    return SUBSCRIPTION_CONFIGS[validTier];
}

/**
 * Check if a feature is enabled for a tier
 */
export function hasFeature(tier: SubscriptionTier | string, feature: keyof FeatureFlags): boolean {
    const config = getSubscriptionConfig(tier);
    return config.features[feature];
}

/**
 * Get credit limit for a specific feature
 */
export function getCreditLimit(
    tier: SubscriptionTier | string,
    creditType: keyof CreditLimits
): CreditConfig {
    const config = getSubscriptionConfig(tier);
    return config.credits[creditType];
}

/**
 * Get data limit for a specific type
 */
export function getDataLimit(
    tier: SubscriptionTier | string,
    limitType: keyof DataLimits
): number {
    const config = getSubscriptionConfig(tier);
    return config.limits[limitType];
}

/**
 * Check if user can access a feature (combines feature flag + credits check)
 */
export function canAccessFeature(
    tier: SubscriptionTier | string,
    feature: keyof FeatureFlags
): { allowed: boolean; reason?: string; upgradeTarget?: SubscriptionTier } {
    const config = getSubscriptionConfig(tier);

    if (config.features[feature]) {
        return { allowed: true };
    }

    // Determine upgrade target
    const upgradeTarget: SubscriptionTier =
        config.tier === 'free' ? 'pro' : 'premium';

    const upgradeConfig = getSubscriptionConfig(upgradeTarget);

    return {
        allowed: false,
        reason: `${feature.replace(/^has/, '')} is a ${upgradeConfig.display.name} feature`,
        upgradeTarget,
    };
}

/**
 * Format limit value for display
 */
export function formatLimit(value: number): string {
    if (value === Infinity) return 'unlimited';
    return value.toString();
}

/**
 * Format price for display
 */
export function formatPrice(cents: number): string {
    if (cents === 0) return 'Free';
    return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Get the next tier for upgrade
 */
export function getUpgradeTier(currentTier: SubscriptionTier | string): SubscriptionTier | null {
    const tier = (currentTier in SUBSCRIPTION_CONFIGS ? currentTier : 'free') as SubscriptionTier;
    if (tier === 'free') return 'pro';
    if (tier === 'pro') return 'premium';
    return null;
}

/**
 * Compare two tiers (returns -1, 0, or 1)
 */
export function compareTiers(a: SubscriptionTier | string, b: SubscriptionTier | string): number {
    const order: Record<SubscriptionTier, number> = { free: 0, pro: 1, premium: 2 };
    const tierA = (a in order ? a : 'free') as SubscriptionTier;
    const tierB = (b in order ? b : 'free') as SubscriptionTier;
    return order[tierA] - order[tierB];
}

/**
 * Check if tier A is at least tier B
 */
export function isAtLeastTier(userTier: SubscriptionTier | string, requiredTier: SubscriptionTier): boolean {
    return compareTiers(userTier, requiredTier) >= 0;
}

// =============================================================================
// Legacy Compatibility (to ease migration)
// =============================================================================

/**
 * @deprecated Use SUBSCRIPTION_CONFIGS instead
 * Legacy format for backward compatibility during migration
 */
export const TIER_LIMITS = {
    free: {
        banks: FREE_CONFIG.limits.maxBanks,
        accountsPerBank: FREE_CONFIG.limits.maxAccountsPerBank,
        currenciesPerAccount: FREE_CONFIG.limits.maxCurrenciesPerAccount,
        transactionHistoryDays: FREE_CONFIG.limits.transactionHistoryDays,
        totalStocks: FREE_CONFIG.limits.maxStocks,
        aiQuestionsPerDay: FREE_CONFIG.credits.aiChat.limit,
        aiQuestionsLifetime: FREE_CONFIG.credits.aiChat.lifetimeLimit ?? Infinity,
        hasAiMarketDigest: FREE_CONFIG.features.hasAiMarketDigest,
        aiDigestRegeneratePerDay: FREE_CONFIG.credits.aiDigestRegeneration.limit,
        hasCurrencyWidget: FREE_CONFIG.features.hasCurrencyWidget,
    },
    pro: {
        banks: PRO_CONFIG.limits.maxBanks,
        accountsPerBank: PRO_CONFIG.limits.maxAccountsPerBank,
        currenciesPerAccount: PRO_CONFIG.limits.maxCurrenciesPerAccount,
        transactionHistoryDays: PRO_CONFIG.limits.transactionHistoryDays,
        totalStocks: PRO_CONFIG.limits.maxStocks,
        aiQuestionsPerDay: PRO_CONFIG.credits.aiChat.limit,
        aiQuestionsLifetime: Infinity,
        hasAiMarketDigest: PRO_CONFIG.features.hasAiMarketDigest,
        aiDigestLength: PRO_CONFIG.display.aiDigestLength,
        aiDigestRegeneratePerDay: PRO_CONFIG.credits.aiDigestRegeneration.limit,
        hasCurrencyWidget: PRO_CONFIG.features.hasCurrencyWidget,
    },
    premium: {
        banks: PREMIUM_CONFIG.limits.maxBanks,
        accountsPerBank: PREMIUM_CONFIG.limits.maxAccountsPerBank,
        currenciesPerAccount: PREMIUM_CONFIG.limits.maxCurrenciesPerAccount,
        transactionHistoryDays: PREMIUM_CONFIG.limits.transactionHistoryDays,
        totalStocks: PREMIUM_CONFIG.limits.maxStocks,
        aiQuestionsPerDay: PREMIUM_CONFIG.credits.aiChat.limit,
        aiQuestionsLifetime: Infinity,
        hasAiMarketDigest: PREMIUM_CONFIG.features.hasAiMarketDigest,
        aiDigestLength: PREMIUM_CONFIG.display.aiDigestLength,
        aiDigestRegeneratePerDay: PREMIUM_CONFIG.credits.aiDigestRegeneration.limit,
        hasCurrencyWidget: PREMIUM_CONFIG.features.hasCurrencyWidget,
    },
} as const;
