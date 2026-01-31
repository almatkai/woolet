import { describe, expect, test, mock } from "bun:test";
import { accountRouter } from "../../src/routers/account";
import { createMockContext } from "../utils";
import { TRPCError } from "@trpc/server";

describe("Account Router", () => {
    const mockUser = {
        id: "test-user-id",
        testMode: false
    };

    const bankId = "123e4567-e89b-12d3-a456-426614174000";
    const accountId = "123e4567-e89b-12d3-a456-426614174001";
    const balanceId = "123e4567-e89b-12d3-a456-426614174002";

    test("list should return accounts for user banks", async () => {
        const mockBanks = [
            {
                id: bankId,
                name: "Test Bank",
                icon: "bank-icon",
                color: "blue",
                accounts: [
                    {
                        id: accountId,
                        name: "Test Account",
                        type: "checking",
                        currencyBalances: []
                    }
                ]
            }
        ];

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
                banks: {
                    findMany: mock(() => Promise.resolve(mockBanks)),
                }
            },
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = accountRouter.createCaller(ctx);
        const result = await caller.list({});
        
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(accountId);
        expect(result[0].bank.name).toBe("Test Bank");
    });

    test("create should throw NOT_FOUND if bank doesn't exist for user", async () => {
        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
                banks: {
                    findFirst: mock(() => Promise.resolve(null)),
                }
            },
            select: mock(() => ({
                from: mock(() => ({
                    where: mock(() => Promise.resolve([{ count: 0 }]))
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = accountRouter.createCaller(ctx);

        let error;
        try {
            await caller.create({
                bankId: bankId,
                name: "New Account",
                type: "checking"
            });
        } catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
        expect((error as TRPCError).code).toBe('NOT_FOUND');
    });

    test("adjustBalance should create transaction and update balance", async () => {
        const mockBalance = {
            id: balanceId,
            balance: "100",
            accountId: accountId,
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
                    findFirst: mock(() => Promise.resolve({ id: 'cat-adj', name: 'Adjustment' }))
                }
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([{ id: 'tx-adj' }]))
                }))
            })),
            update: mock(() => ({
                set: mock(() => ({
                    where: mock(() => Promise.resolve())
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = accountRouter.createCaller(ctx);

        const result = await caller.adjustBalance({
            currencyBalanceId: balanceId,
            newBalance: 150,
            reason: "Adjustment test"
        });

        expect(result.success).toBe(true);
        expect(mockDb.insert).toHaveBeenCalled(); // Transaction
        expect(mockDb.update).toHaveBeenCalled(); // Balance update
    });
});
