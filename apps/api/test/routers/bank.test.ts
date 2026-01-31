import { describe, expect, test, mock } from "bun:test";
import { bankRouter } from "../../src/routers/bank";
import { createMockContext } from "../utils";

describe("Bank Router", () => {
    const mockUser = {
        id: "test-user-id",
        testMode: false
    };

    test("list should return banks for the user", async () => {
        const mockBanks = [
            { id: "bank-1", name: "Bank 1", userId: "test-user-id" }
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
        const caller = bankRouter.createCaller(ctx);
        const result = await caller.list();
        
        expect(result).toMatchObject(mockBanks);
        expect(mockDb.query.users.findFirst).toHaveBeenCalled();
        expect(mockDb.query.banks.findMany).toHaveBeenCalled();
    });

    test("create should insert a new bank", async () => {
        const newBank = { 
            id: "bank-new", 
            name: "New Bank", 
            userId: "test-user-id",
            isTest: false 
        };

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([newBank]))
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = bankRouter.createCaller(ctx);
        const result = await caller.create({ name: "New Bank" });
        
        expect(result).toMatchObject(newBank);
        expect(mockDb.insert).toHaveBeenCalled();
    });
});
