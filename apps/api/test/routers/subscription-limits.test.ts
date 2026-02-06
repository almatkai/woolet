import { describe, expect, test, mock, beforeEach } from "bun:test";
import { bankRouter } from "../../src/routers/bank";
import { createMockContext } from "../utils";
import { TIER_LIMITS } from "../../src/routers/bank";

describe("Subscription System - Bank Limits", () => {
    describe("Free Tier", () => {
        test("should allow creating banks up to the free limit (2)", async () => {
            const mockUser = {
                id: "free-user",
                email: "free@example.com",
                subscriptionTier: "free",
                testMode: false,
            };

            // Simulate 1 existing bank
            const mockDb = {
                query: {
                    users: {
                        findFirst: mock(() => Promise.resolve(mockUser)),
                    },
                },
                select: mock(() => ({
                    from: mock(() => ({
                        where: mock(() => Promise.resolve([{ count: 1 }]))
                    }))
                })),
                insert: mock(() => ({
                    values: mock(() => ({
                        returning: mock(() => Promise.resolve([{
                            id: "bank-2",
                            name: "Second Bank",
                            userId: "free-user",
                            isTest: false
                        }]))
                    }))
                }))
            };

            const ctx = createMockContext({
                userId: "free-user",
                user: mockUser,
                db: mockDb as any
            });
            const caller = bankRouter.createCaller(ctx);

            // Should succeed - creating 2nd bank (within limit)
            const result = await caller.create({ name: "Second Bank" });
            expect(result).toBeDefined();
            expect(result.name).toBe("Second Bank");
        });

        test("should block creating banks beyond free limit (2)", async () => {
            const mockUser = {
                id: "free-user",
                email: "free@example.com",
                subscriptionTier: "free",
                testMode: false,
            };

            // Simulate 2 existing banks (at limit)
            const mockDb = {
                query: {
                    users: {
                        findFirst: mock(() => Promise.resolve(mockUser)),
                    },
                },
                select: mock(() => ({
                    from: mock(() => ({
                        where: mock(() => Promise.resolve([{ count: 2 }]))
                    }))
                })),
            };

            const ctx = createMockContext({
                userId: "free-user",
                user: mockUser,
                db: mockDb as any
            });
            const caller = bankRouter.createCaller(ctx);

            // Should fail - already at limit
            try {
                await caller.create({ name: "Third Bank" });
                expect(true).toBe(false); // Should not reach here
            } catch (error: any) {
                expect(error.code).toBe("FORBIDDEN");
                expect(error.message).toContain("Bank limit reached");
                expect(error.message).toContain("Upgrade to Pro");
            }
        });
    });

    describe("Pro Tier", () => {
        test("should allow unlimited banks for pro users", async () => {
            const mockUser = {
                id: "pro-user",
                email: "pro@example.com",
                subscriptionTier: "pro",
                testMode: false,
            };

            // Simulate 100 existing banks (way more than free)
            const mockDb = {
                query: {
                    users: {
                        findFirst: mock(() => Promise.resolve(mockUser)),
                    },
                },
                select: mock(() => ({
                    from: mock(() => ({
                        where: mock(() => Promise.resolve([{ count: 100 }]))
                    }))
                })),
                insert: mock(() => ({
                    values: mock(() => ({
                        returning: mock(() => Promise.resolve([{
                            id: "bank-101",
                            name: "Bank 101",
                            userId: "pro-user",
                            isTest: false
                        }]))
                    }))
                }))
            };

            const ctx = createMockContext({
                userId: "pro-user",
                user: mockUser,
                db: mockDb as any
            });
            const caller = bankRouter.createCaller(ctx);

            // Should succeed - pro has unlimited banks
            const result = await caller.create({ name: "Bank 101" });
            expect(result).toBeDefined();
            expect(result.name).toBe("Bank 101");
        });
    });

    describe("Premium Tier", () => {
        test("should allow unlimited banks for premium users", async () => {
            const mockUser = {
                id: "premium-user",
                email: "premium@example.com",
                subscriptionTier: "premium",
                testMode: false,
            };

            // Simulate 1000 existing banks
            const mockDb = {
                query: {
                    users: {
                        findFirst: mock(() => Promise.resolve(mockUser)),
                    },
                },
                select: mock(() => ({
                    from: mock(() => ({
                        where: mock(() => Promise.resolve([{ count: 1000 }]))
                    }))
                })),
                insert: mock(() => ({
                    values: mock(() => ({
                        returning: mock(() => Promise.resolve([{
                            id: "bank-1001",
                            name: "Bank 1001",
                            userId: "premium-user",
                            isTest: false
                        }]))
                    }))
                }))
            };

            const ctx = createMockContext({
                userId: "premium-user",
                user: mockUser,
                db: mockDb as any
            });
            const caller = bankRouter.createCaller(ctx);

            // Should succeed - premium has unlimited banks
            const result = await caller.create({ name: "Bank 1001" });
            expect(result).toBeDefined();
        });
    });

    describe("getLimitsAndUsage", () => {
        test("should return correct limits for free tier", async () => {
            const mockUser = {
                id: "free-user",
                email: "free@example.com",
                subscriptionTier: "free",
                testMode: false,
            };

            const mockDb = {
                query: {
                    users: {
                        findFirst: mock(() => Promise.resolve(mockUser)),
                    },
                },
                select: mock(() => ({
                    from: mock(() => ({
                        where: mock(() => Promise.resolve([{ count: 1 }]))
                    }))
                })),
            };

            const ctx = createMockContext({
                userId: "free-user",
                user: mockUser,
                db: mockDb as any
            });
            const caller = bankRouter.createCaller(ctx);

            const result = await caller.getLimitsAndUsage();

            expect(result.tier).toBe("free");
            expect(result.limits.banks).toBe("2");
            expect(result.limits.accountsPerBank).toBe("2");
            expect(result.limits.currenciesPerAccount).toBe("2");
            expect(result.limits.totalStocks).toBe(5);
            expect(result.limits.aiQuestionsPerDay).toBe(0);
            expect(result.limits.aiQuestionsLifetime).toBe(3);
            expect(result.features.hasCurrencyWidget).toBe(false);
            expect(result.features.hasAiMarketDigest).toBe(false);
            expect(result.usage.banks).toBe(1);
            expect(result.canUpgrade).toBe(true);
        });

        test("should return correct limits for pro tier", async () => {
            const mockUser = {
                id: "pro-user",
                email: "pro@example.com",
                subscriptionTier: "pro",
                testMode: false,
            };

            const mockDb = {
                query: {
                    users: {
                        findFirst: mock(() => Promise.resolve(mockUser)),
                    },
                },
                select: mock(() => ({
                    from: mock(() => ({
                        where: mock(() => Promise.resolve([{ count: 15 }]))
                    }))
                })),
            };

            const ctx = createMockContext({
                userId: "pro-user",
                user: mockUser,
                db: mockDb as any
            });
            const caller = bankRouter.createCaller(ctx);

            const result = await caller.getLimitsAndUsage();

            expect(result.tier).toBe("pro");
            expect(result.limits.banks).toBe("unlimited");
            expect(result.limits.accountsPerBank).toBe("unlimited");
            expect(result.limits.currenciesPerAccount).toBe("5");
            expect(result.limits.totalStocks).toBe(20);
            expect(result.limits.aiQuestionsPerDay).toBe(5);
            expect(result.limits.aiQuestionsLifetime).toBe("unlimited");
            expect(result.features.hasCurrencyWidget).toBe(true);
            expect(result.features.hasAiMarketDigest).toBe(true);
            expect(result.limits.aiDigestLength).toBe("short");
            expect(result.usage.banks).toBe(15);
            expect(result.canUpgrade).toBe(true);
        });

        test("should return correct limits for premium tier", async () => {
            const mockUser = {
                id: "premium-user",
                email: "premium@example.com",
                subscriptionTier: "premium",
                testMode: false,
            };

            const mockDb = {
                query: {
                    users: {
                        findFirst: mock(() => Promise.resolve(mockUser)),
                    },
                },
                select: mock(() => ({
                    from: mock(() => ({
                        where: mock(() => Promise.resolve([{ count: 50 }]))
                    }))
                })),
            };

            const ctx = createMockContext({
                userId: "premium-user",
                user: mockUser,
                db: mockDb as any
            });
            const caller = bankRouter.createCaller(ctx);

            const result = await caller.getLimitsAndUsage();

            expect(result.tier).toBe("premium");
            expect(result.limits.banks).toBe("unlimited");
            expect(result.limits.accountsPerBank).toBe("unlimited");
            expect(result.limits.currenciesPerAccount).toBe("unlimited");
            expect(result.limits.totalStocks).toBe(1000);
            expect(result.limits.aiQuestionsPerDay).toBe(25);
            expect(result.features.hasCurrencyWidget).toBe(true);
            expect(result.features.hasAiMarketDigest).toBe(true);
            expect(result.limits.aiDigestLength).toBe("complete");
            expect(result.usage.banks).toBe(50);
            expect(result.canUpgrade).toBe(false); // Already at top tier
        });
    });
});
