import { describe, expect, test, mock } from "bun:test";
import { subscriptionRouter } from "../../src/routers/subscription";
import { createMockContext } from "../utils";
import { TRPCError } from "@trpc/server";

describe("Subscription Router", () => {
    const mockUser = {
        id: "test-user-id",
        testMode: false
    };

    const subId = "123e4567-e89b-12d3-a456-426614174000";
    const balanceId = "123e4567-e89b-12d3-a456-426614174001";
    const txId = "123e4567-e89b-12d3-a456-426614174002";

    test("create should insert a new subscription", async () => {
        const mockDb = {
            query: {
                users: { findFirst: mock(() => Promise.resolve(mockUser)) },
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([{ id: subId }]))
                }))
            })),
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ count: 0 }]))
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = subscriptionRouter.createCaller(ctx);

        const result = await caller.create({
            name: "Netflix",
            type: "general",
            amount: 15.99,
            currency: "USD",
            frequency: "monthly",
            billingDay: 15,
            startDate: "2023-01-01",
            icon: "🎬",
            color: "#e50914"
        });

        expect(result.id).toBe(subId);
        expect(mockDb.insert).toHaveBeenCalled();
    });

    test("makePayment should record payment and update balance", async () => {
        const mockSub = { id: subId, name: "Netflix", userId: "test-user-id" };
        const mockBalance = {
            id: balanceId,
            balance: "100",
            account: { bank: { userId: "test-user-id" } }
        };

        const mockDb = {
            query: {
                users: { findFirst: mock(() => Promise.resolve(mockUser)) },
                subscriptions: { findFirst: mock(() => Promise.resolve(mockSub)) },
                currencyBalances: { findFirst: mock(() => Promise.resolve(mockBalance)) },
                categories: { findFirst: mock(() => Promise.resolve({ id: 'cat-sub' })) }
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([{ id: txId }]))
                }))
            })),
            update: mock(() => ({
                set: mock(() => ({
                    where: mock(() => Promise.resolve())
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = subscriptionRouter.createCaller(ctx);

        const result = await caller.makePayment({
            subscriptionId: subId,
            currencyBalanceId: balanceId,
            amount: 15.99
        });

        expect(result.success).toBe(true);
        expect(mockDb.update).toHaveBeenCalled(); // balance update
        expect(mockDb.insert).toHaveBeenCalled(); // transaction + subscription payment
    });

    test("getUpcoming should calculate next due dates", async () => {
        const mockSubs = [
            {
                id: subId,
                name: "Netflix",
                billingDay: 15,
                status: "active",
                payments: []
            }
        ];

        const mockDb = {
            query: {
                users: { findFirst: mock(() => Promise.resolve(mockUser)) },
                subscriptions: { findMany: mock(() => Promise.resolve(mockSubs)) },
            }
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = subscriptionRouter.createCaller(ctx);

        const result = await caller.getUpcoming({ days: 60 });

        expect(result).toHaveLength(1);
        expect(result[0].subscription.name).toBe("Netflix");
        expect(result[0].dueDate).toBeInstanceOf(Date);
    });
});
