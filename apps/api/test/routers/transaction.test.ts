import { describe, expect, test, mock } from "bun:test";
import { transactionRouter } from "../../src/routers/transaction";
import { createMockContext } from "../utils";
import { TRPCError } from "@trpc/server";

mock.module("../../src/lib/limits", () => ({
    checkEntityLimit: mock(() => Promise.resolve()),
}));

describe("Transaction Router", () => {
    const mockUser = {
        id: "test-user-id",
        testMode: false
    };

    const balanceId = "123e4567-e89b-12d3-a456-426614174000";
    const categoryId = "123e4567-e89b-12d3-a456-426614174001";

    test("create should create an expense transaction and update balance", async () => {
        const mockBalance = {
            id: balanceId,
            balance: "1000",
            accountId: "account-1",
            account: {
                bank: {
                    isTest: false
                }
            }
        };

        const newTransaction = {
            id: "tx-1",
            amount: "100",
            type: "expense",
            date: "2023-01-01"
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
                    findFirst: mock(() => Promise.resolve({ id: categoryId }))
                }
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([newTransaction]))
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
        const caller = transactionRouter.createCaller(ctx);

        const input = {
            currencyBalanceId: balanceId,
            amount: 100,
            type: "expense" as const,
            date: "2023-01-01T00:00:00Z",
            description: "Test Expense",
            categoryId: categoryId
        };

        const result = await caller.create(input);

        expect(result).toMatchObject(newTransaction);
        expect(mockDb.insert).toHaveBeenCalled();
        expect(mockDb.update).toHaveBeenCalled();
    });

    test("create should throw if insufficient funds", async () => {
        const mockBalance = {
            id: balanceId,
            balance: "50", // Less than 100
            accountId: "account-1",
            account: {
                bank: {
                    isTest: false
                }
            }
        };

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
                currencyBalances: {
                    findFirst: mock(() => Promise.resolve(mockBalance)),
                },
            },
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ count: 0 }]))
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = transactionRouter.createCaller(ctx);

        const input = {
            currencyBalanceId: balanceId,
            amount: 100,
            type: "expense" as const,
            date: "2023-01-01T00:00:00Z",
            categoryId: categoryId
        };

        // Expect fail
        let error;
        try {
            await caller.create(input);
        } catch (e) {
            error = e;
        }
        expect(error).toBeDefined();
        expect((error as TRPCError).code).toBe('BAD_REQUEST');
    });

    test("list should return transactions for allowed balances", async () => {
        const mockDb = {
            query: {
                banks: {
                    findMany: mock(() => Promise.resolve([{
                        id: "bank-1",
                        accounts: [{
                            currencyBalances: [{ id: balanceId }]
                        }]
                    }])),
                },
                currencyBalances: {
                    findMany: mock(() => Promise.resolve([{ id: balanceId }])),
                },
                transactions: {
                    findMany: mock(() => Promise.resolve([])),
                },
            },
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = transactionRouter.createCaller(ctx);

        const result = await caller.list({ limit: 10 });
        expect(result.transactions).toBeDefined();
        expect(mockDb.query.transactions.findMany).toHaveBeenCalled();
    });

    test("delete should rollback income balance", async () => {
        const transactionId = "123e4567-e89b-12d3-a456-426614174002";
        const mockTransaction = {
            id: transactionId,
            type: "income",
            amount: "100",
            currencyBalanceId: balanceId,
        };

        const mockDb = {
            query: {
                transactions: {
                    findFirst: mock(() => Promise.resolve(mockTransaction)),
                },
            },
            update: mock(() => ({
                set: mock(() => ({
                    where: mock(() => Promise.resolve())
                }))
            })),
            delete: mock(() => ({
                where: mock(() => Promise.resolve())
            })),
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = transactionRouter.createCaller(ctx);

        const result = await caller.delete({ id: transactionId });
        expect(result.success).toBe(true);
        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.delete).toHaveBeenCalled();
    });

    test("getSpendingStats should return aggregated data", async () => {
        const mockTransactions = [
            { categoryId: "c1", amount: "100", date: "2023-01-01", category: { id: "c1", name: "Food", color: "red" } },
            { categoryId: "c1", amount: "50", date: "2023-01-01", category: { id: "c1", name: "Food", color: "red" } },
            { categoryId: "c2", amount: "200", date: "2023-01-02", category: { id: "c2", name: "Rent", color: "blue" } },
        ];

        const mockDb = {
            query: {
                banks: {
                    findMany: mock(() => Promise.resolve([{
                        id: "bank-1",
                        accounts: [{
                            currencyBalances: [{ id: balanceId }]
                        }]
                    }])),
                },
                currencyBalances: {
                    findMany: mock(() => Promise.resolve([{ id: balanceId }])),
                },
                transactions: {
                    findMany: mock(() => Promise.resolve(mockTransactions)),
                },
            },
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = transactionRouter.createCaller(ctx);

        const result = await caller.getSpendingStats({
            startDate: "2023-01-01T00:00:00Z",
            endDate: "2023-01-31T00:00:00Z"
        });

        expect(result.total).toBe(350);
        expect(result.categoryData).toHaveLength(2);
        expect(result.timeSeriesData).toHaveLength(2);
    });
});