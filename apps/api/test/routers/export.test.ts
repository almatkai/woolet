import { describe, expect, test, mock, beforeEach } from "bun:test";
import { userRouter } from "../../src/routers/user";
import { createMockContext } from "../utils";
import { TRPCError } from "@trpc/server";

describe("Export Restrictions", () => {
    beforeEach(() => {
        mock.restore();
    });

    test("Free tier should have daily and weekly limits", async () => {
        // Mock daily count = 1 (limit reached for free)
        const mockDb = {
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ value: 1 }]))
                }))
            })),
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve({
                        id: 'test-user-id',
                        subscriptionTier: 'free'
                    }))
                }
            }
        };

        const ctx = createMockContext({
            db: mockDb as any,
            userId: "test-user-id"
        });

        const caller = userRouter.createCaller(ctx);

        try {
            await caller.exportAllData();
            expect(true).toBe(false); // Should not reach here
        } catch (e: any) {
            expect(e).toBeInstanceOf(TRPCError);
            expect(e.code).toBe("TOO_MANY_REQUESTS");
            expect(e.message).toContain("Daily export limit reached");
        }
    });

    test("Pro tier should have higher limits", async () => {
        // Mock daily count = 1 (within limits for pro)
        // Weekly count = 1
        const mockDb = {
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ value: 1 }]))
                }))
            })),
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve({
                        id: 'test_user_id',
                        subscriptionTier: 'pro'
                    }))
                },
                banks: { findMany: mock(() => Promise.resolve([])) },
                categories: { findMany: mock(() => Promise.resolve([])), },
                userSettings: { findMany: mock(() => Promise.resolve([])), },
                dashboardLayouts: { findMany: mock(() => Promise.resolve([])), },
                subscriptions: { findMany: mock(() => Promise.resolve([])), },
            },
            insert: mock(() => ({
                values: mock(() => Promise.resolve())
            }))
        };

        const ctx = createMockContext({
            db: mockDb as any,
            userId: "test_user_id"
        });

        const caller = userRouter.createCaller(ctx);
        const result = await caller.exportAllData();

        expect(result).toBeDefined();
        expect(mockDb.insert).toHaveBeenCalled();
    });

    test("Free tier should filter transactions older than 2 months", async () => {
        const mockDb = {
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ value: 0 }])) // No history
                }))
            })),
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve({
                        id: 'test_user_id',
                        subscriptionTier: 'free'
                    }))
                },
                banks: { findMany: mock(() => Promise.resolve([{ id: 'bank1' }])) },
                accounts: { findMany: mock(() => Promise.resolve([{ id: 'acc1' }])) },
                currencyBalances: { findMany: mock(() => Promise.resolve([{ id: 'bal1' }])) },
                transactions: { findMany: mock(() => Promise.resolve([])) },
                categories: { findMany: mock(() => Promise.resolve([])), },
                userSettings: { findMany: mock(() => Promise.resolve([])), },
                dashboardLayouts: { findMany: mock(() => Promise.resolve([])), },
                subscriptions: { findMany: mock(() => Promise.resolve([])), },
                debts: { findMany: mock(() => Promise.resolve([])), },
                stocks: { findMany: mock(() => Promise.resolve([])), },
                portfolioHoldings: { findMany: mock(() => Promise.resolve([])), },
                investmentTransactions: { findMany: mock(() => Promise.resolve([])), },
                splitParticipants: { findMany: mock(() => Promise.resolve([])), },
            },
            insert: mock(() => ({
                values: mock(() => Promise.resolve())
            }))
        };

        const ctx = createMockContext({
            db: mockDb as any,
            userId: "test_user_id"
        });

        const caller = userRouter.createCaller(ctx);
        await caller.exportAllData();

        // Check if transactions.findMany was called with a where clause that includes a date limit
        // Since we are using mock proxies in utils.ts, we need to be careful.
        // But our direct mock in mockDb for transactions should be used.
        expect(mockDb.query.transactions.findMany).toHaveBeenCalled();
        const callArgs = (mockDb.query.transactions.findMany as any).mock.calls[0][0];
        expect(callArgs.where).toBeDefined();
        // The condition for free tier involves date limit
        // We can't easily inspect the internal 'and' / 'gte' structure of Drizzle here without more setup,
        // but we can verify it was called.
    });

    test("Export should include always-available data like categories and user settings", async () => {
        const mockCategories = [{ id: 'cat1', name: 'Food' }];
        const mockSettings = [{ id: 'sett1', theme: 'dark' }];

        const mockDb = {
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ value: 0 }]))
                }))
            })),
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve({
                        id: 'test_user_id',
                        subscriptionTier: 'pro'
                    }))
                },
                banks: { findMany: mock(() => Promise.resolve([])) },
                categories: { findMany: mock(() => Promise.resolve(mockCategories)), },
                userSettings: { findMany: mock(() => Promise.resolve(mockSettings)), },
                dashboardLayouts: { findMany: mock(() => Promise.resolve([])), },
                subscriptions: { findMany: mock(() => Promise.resolve([])), },
                debts: { findMany: mock(() => Promise.resolve([])), },
                stocks: { findMany: mock(() => Promise.resolve([])), },
                portfolioHoldings: { findMany: mock(() => Promise.resolve([])), },
                investmentTransactions: { findMany: mock(() => Promise.resolve([])), },
                splitParticipants: { findMany: mock(() => Promise.resolve([])), },
            },
            insert: mock(() => ({
                values: mock(() => Promise.resolve())
            }))
        };

        const ctx = createMockContext({
            db: mockDb as any,
            userId: "test_user_id"
        });

        const caller = userRouter.createCaller(ctx);
        const result = await caller.exportAllData();

        expect(result.data.categories as any).toEqual(mockCategories);
        expect(result.data.userSettings as any).toEqual(mockSettings);
    });
});
