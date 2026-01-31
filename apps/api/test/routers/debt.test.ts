import { describe, expect, test, mock } from "bun:test";
import { debtRouter } from "../../src/routers/debt";
import { createMockContext } from "../utils";
import { TRPCError } from "@trpc/server";

describe("Debt Router", () => {
    const mockUser = {
        id: "test-user-id",
        testMode: false
    };

    const balanceId = "123e4567-e89b-12d3-a456-426614174000";
    const debtId = "123e4567-e89b-12d3-a456-426614174001";
    const paymentId = "123e4567-e89b-12d3-a456-426614174002";

    test("create should record debt and update balance", async () => {
        const mockBalance = {
            id: balanceId,
            balance: "1000",
            currencyCode: "USD"
        };

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
                currencyBalances: {
                    findFirst: mock(() => Promise.resolve(mockBalance)),
                },
                categories: {
                    findFirst: mock(() => Promise.resolve({ id: 'cat-debt', name: 'Debt' }))
                },
                debts: {
                    findMany: mock(() => Promise.resolve([])), // for lazy cleanup
                }
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([{ id: debtId }]))
                }))
            })),
            update: mock(() => ({
                set: mock(() => ({
                    where: mock(() => Promise.resolve())
                }))
            })),
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ count: 0 }]))
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = debtRouter.createCaller(ctx);

        const result = await caller.create({
            personName: "John Doe",
            amount: 500,
            type: "they_owe",
            currencyBalanceId: balanceId
        });

        expect(result.id).toBe(debtId);
        expect(mockDb.insert).toHaveBeenCalled(); // Debt + Transaction
        expect(mockDb.update).toHaveBeenCalled(); // Balance update
    });

    test("addPayment should update debt and balance", async () => {
        const mockDebt = {
            id: debtId,
            userId: "test-user-id",
            amount: "1000",
            paidAmount: "0",
            type: "they_owe",
            currencyBalanceId: balanceId,
            currencyBalance: {
                currencyCode: "USD"
            },
            createdAt: new Date()
        };

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
                debts: {
                    findFirst: mock(() => Promise.resolve(mockDebt)),
                },
                currencyBalances: {
                    findMany: mock(() => Promise.resolve([{ id: balanceId, currencyCode: "USD" }])),
                    findFirst: mock(() => Promise.resolve({ id: balanceId, currencyCode: "USD" }))
                },
                categories: {
                    findFirst: mock(() => Promise.resolve({ id: 'cat-repay', name: 'Debt Repayment' }))
                }
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([{ id: paymentId }]))
                }))
            })),
            update: mock(() => ({
                set: mock(() => ({
                    where: mock(() => Promise.resolve())
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = debtRouter.createCaller(ctx);

        const result = await caller.addPayment({
            debtId: debtId,
            amount: 500,
            paymentDate: new Date().toISOString(),
            distributions: [{
                currencyBalanceId: balanceId,
                amount: 500
            }]
        });

        expect(result.success).toBe(true);
        expect(mockDb.update).toHaveBeenCalled(); // Update debt paidAmount + update balance
    });
});
