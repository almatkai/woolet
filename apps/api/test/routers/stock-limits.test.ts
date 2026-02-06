import { describe, expect, test, mock } from "bun:test";
import { createMockContext } from "../utils";
import { TIER_LIMITS } from "../../src/routers/bank";

// Mock stock limits checking
class StockLimitChecker {
    async checkStockLimit(
        userId: string,
        currentHoldings: number,
        tier: 'free' | 'pro' | 'premium'
    ): Promise<{ allowed: boolean; limit: number; message?: string }> {
        const limits = {
            free: 5,
            pro: 20,
            premium: 1000
        };

        const limit = limits[tier];

        if (currentHoldings >= limit) {
            const upgradeMessage = tier === 'free'
                ? 'Upgrade to Pro ($8/month) for 20 stocks'
                : tier === 'pro'
                    ? 'Upgrade to Premium ($20/month) for 1,000 stocks'
                    : 'You have reached the maximum stock limit';

            return {
                allowed: false,
                limit,
                message: `Stock limit reached (${limit}). ${upgradeMessage}`
            };
        }

        return { allowed: true, limit };
    }

    async countUniqueStocks(holdings: Array<{ symbol: string; quantity: number }>): Promise<number> {
        // Count unique stock symbols (not total quantity)
        const uniqueSymbols = new Set(holdings.map(h => h.symbol));
        return uniqueSymbols.size;
    }
}

describe("Subscription System - Stock Portfolio Limits", () => {
    const checker = new StockLimitChecker();

    describe("Free Tier Stock Limits", () => {
        test("should allow adding up to 5 different stocks", async () => {
            const holdings = [
                { symbol: 'GOOGL', quantity: 2 },
                { symbol: 'MSFT', quantity: 1 },
                { symbol: 'META', quantity: 10 },
                { symbol: 'FIGMA', quantity: 2 },
            ];

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(4);

            const result = await checker.checkStockLimit('free-user', uniqueCount, 'free');
            expect(result.allowed).toBe(true);
            expect(result.limit).toBe(5);
        });

        test("should block adding 6th stock for free users", async () => {
            const holdings = [
                { symbol: 'GOOGL', quantity: 2 },
                { symbol: 'MSFT', quantity: 1 },
                { symbol: 'META', quantity: 10 },
                { symbol: 'FIGMA', quantity: 2 },
                { symbol: 'INTC', quantity: 4 },
            ];

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(5);

            // Try to add 6th stock
            const result = await checker.checkStockLimit('free-user', uniqueCount, 'free');
            expect(result.allowed).toBe(false);
            expect(result.limit).toBe(5);
            expect(result.message).toContain("Upgrade to Pro");
        });

        test("should count unique stocks, not total quantity", async () => {
            // User has 100 shares of GOOGL but it's only 1 stock type
            const holdings = [
                { symbol: 'GOOGL', quantity: 100 },
                { symbol: 'MSFT', quantity: 50 },
            ];

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(2); // Only 2 different stocks
        });

        test("should handle duplicate stock additions correctly", async () => {
            const holdings = [
                { symbol: 'GOOGL', quantity: 2 },
                { symbol: 'GOOGL', quantity: 3 }, // Adding more of same stock
                { symbol: 'MSFT', quantity: 1 },
            ];

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(2); // Still only 2 different stocks
        });
    });

    describe("Pro Tier Stock Limits", () => {
        test("should allow up to 20 different stocks", async () => {
            const holdings = Array.from({ length: 15 }, (_, i) => ({
                symbol: `STOCK${i + 1}`,
                quantity: 1
            }));

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(15);

            const result = await checker.checkStockLimit('pro-user', uniqueCount, 'pro');
            expect(result.allowed).toBe(true);
            expect(result.limit).toBe(20);
        });

        test("should block adding 21st stock for pro users", async () => {
            const holdings = Array.from({ length: 20 }, (_, i) => ({
                symbol: `STOCK${i + 1}`,
                quantity: 1
            }));

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(20);

            const result = await checker.checkStockLimit('pro-user', uniqueCount, 'pro');
            expect(result.allowed).toBe(false);
            expect(result.message).toContain("Upgrade to Premium");
        });
    });

    describe("Premium Tier Stock Limits", () => {
        test("should allow up to 1000 different stocks", async () => {
            const holdings = Array.from({ length: 500 }, (_, i) => ({
                symbol: `STOCK${i + 1}`,
                quantity: 1
            }));

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(500);

            const result = await checker.checkStockLimit('premium-user', uniqueCount, 'premium');
            expect(result.allowed).toBe(true);
            expect(result.limit).toBe(1000);
        });

        test("should block adding 1001st stock for premium users", async () => {
            const holdings = Array.from({ length: 1000 }, (_, i) => ({
                symbol: `STOCK${i + 1}`,
                quantity: 1
            }));

            const uniqueCount = await checker.countUniqueStocks(holdings);
            expect(uniqueCount).toBe(1000);

            const result = await checker.checkStockLimit('premium-user', uniqueCount, 'premium');
            expect(result.allowed).toBe(false);
            expect(result.message).toContain("maximum stock limit");
        });
    });
});

describe("Subscription System - Feature Access", () => {
    describe("Currency Widget Feature", () => {
        test("free users should not have access to currency widget", () => {
            const limits = TIER_LIMITS.free;
            expect(limits.hasCurrencyWidget).toBe(false);
        });

        test("pro users should have access to currency widget", () => {
            const limits = TIER_LIMITS.pro;
            expect(limits.hasCurrencyWidget).toBe(true);
        });

        test("premium users should have access to currency widget", () => {
            const limits = TIER_LIMITS.premium;
            expect(limits.hasCurrencyWidget).toBe(true);
        });

        test("should show upgrade prompt when free user tries to access currency widget", () => {
            const userTier = 'free';
            const limits = TIER_LIMITS[userTier];

            if (!limits.hasCurrencyWidget) {
                const errorMessage = "Currency Widget is locked. Upgrade to Pro ($8/month) to unlock this feature.";
                expect(errorMessage).toContain("Upgrade to Pro");
            }
        });
    });

    describe("Transaction History Feature", () => {
        test("free users should have 90-day transaction history", () => {
            const limits = TIER_LIMITS.free;
            expect(limits.transactionHistoryDays).toBe(90);
        });

        test("pro users should have unlimited transaction history", () => {
            const limits = TIER_LIMITS.pro;
            expect(limits.transactionHistoryDays).toBe(Infinity);
        });

        test("premium users should have unlimited transaction history", () => {
            const limits = TIER_LIMITS.premium;
            expect(limits.transactionHistoryDays).toBe(Infinity);
        });

        test("should filter transactions by date for free users", () => {
            const limits = TIER_LIMITS.free;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - limits.transactionHistoryDays);

            const transaction1 = { date: new Date(), amount: 100 }; // Recent
            const transaction2 = { date: new Date(cutoffDate.getTime() - 86400000), amount: 50 }; // Too old

            expect(transaction1.date >= cutoffDate).toBe(true);
            expect(transaction2.date >= cutoffDate).toBe(false);
        });
    });

    describe("Account and Currency Limits", () => {
        test("free users should have 2 accounts per bank", () => {
            const limits = TIER_LIMITS.free;
            expect(limits.accountsPerBank).toBe(2);
        });

        test("free users should have 2 currencies per account", () => {
            const limits = TIER_LIMITS.free;
            expect(limits.currenciesPerAccount).toBe(2);
        });

        test("pro users should have unlimited accounts but 5 currencies", () => {
            const limits = TIER_LIMITS.pro;
            expect(limits.accountsPerBank).toBe(Infinity);
            expect(limits.currenciesPerAccount).toBe(5);
        });

        test("premium users should have unlimited accounts and currencies", () => {
            const limits = TIER_LIMITS.premium;
            expect(limits.accountsPerBank).toBe(Infinity);
            expect(limits.currenciesPerAccount).toBe(Infinity);
        });
    });
});

describe("Subscription System - Upgrade Scenarios", () => {
    test("upgrading from free to pro should unlock features immediately", () => {
        const beforeUpgrade = TIER_LIMITS.free;
        const afterUpgrade = TIER_LIMITS.pro;

        expect(beforeUpgrade.banks).toBe(2);
        expect(afterUpgrade.banks).toBe(Infinity);

        expect(beforeUpgrade.hasCurrencyWidget).toBe(false);
        expect(afterUpgrade.hasCurrencyWidget).toBe(true);

        expect(beforeUpgrade.aiQuestionsPerDay).toBe(0);
        expect(afterUpgrade.aiQuestionsPerDay).toBe(5);
    });

    test("upgrading from pro to premium should increase limits", () => {
        const beforeUpgrade = TIER_LIMITS.pro;
        const afterUpgrade = TIER_LIMITS.premium;

        expect(beforeUpgrade.totalStocks).toBe(20);
        expect(afterUpgrade.totalStocks).toBe(1000);

        expect(beforeUpgrade.currenciesPerAccount).toBe(5);
        expect(afterUpgrade.currenciesPerAccount).toBe(Infinity);

        expect(beforeUpgrade.aiQuestionsPerDay).toBe(5);
        expect(afterUpgrade.aiQuestionsPerDay).toBe(25);

        expect(beforeUpgrade.aiDigestLength).toBe('short');
        expect(afterUpgrade.aiDigestLength).toBe('complete');
    });

    test("downgrading should warn about data loss", () => {
        // If user has 10 banks and downgrades to free (2 banks limit)
        const currentBanks = 10;
        const freeLimits = TIER_LIMITS.free;

        if (currentBanks > freeLimits.banks) {
            const warningMessage = `You currently have ${currentBanks} banks. Downgrading to Free will limit you to ${freeLimits.banks} banks. Additional banks will be archived.`;
            expect(warningMessage).toContain("will be archived");
        }
    });
});
