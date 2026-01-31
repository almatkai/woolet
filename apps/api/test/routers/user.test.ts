import { describe, expect, test, mock } from "bun:test";
import { userRouter } from "../../src/routers/user";
import { createMockContext } from "../utils";

describe("User Router", () => {
    test("me should return the current user", async () => {
        const mockUser = {
            id: "test-user-id",
            email: "test@example.com",
            name: "Test User",
            defaultCurrency: "USD",
        };

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
            },
        };

        const ctx = createMockContext({ 
            db: mockDb as any,
            userId: "test-user-id"
        });

        const caller = userRouter.createCaller(ctx);
        const result = await caller.me();
        
        expect(result).toMatchObject(mockUser);
        expect(mockDb.query.users.findFirst).toHaveBeenCalled();
    });

    test("update should update user details", async () => {
         const mockUser = {
            id: "test-user-id",
            email: "test@example.com",
            name: "Old Name",
            defaultCurrency: "USD",
        };
        
        const updatedUser = {
            ...mockUser,
            name: "New Name"
        };

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
            },
            update: mock(() => ({
                set: mock(() => ({
                    where: mock(() => ({
                        returning: mock(() => Promise.resolve([updatedUser]))
                    }))
                }))
            }))
        };

        const ctx = createMockContext({ 
            db: mockDb as any,
            userId: "test-user-id"
        });

        const caller = userRouter.createCaller(ctx);
        const result = await caller.update({ name: "New Name" });
        
        expect(result).toMatchObject(updatedUser);
        expect(mockDb.update).toHaveBeenCalled();
    });
});
