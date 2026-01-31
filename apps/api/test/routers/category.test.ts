import { describe, expect, test, mock } from "bun:test";
import { categoryRouter } from "../../src/routers/category";
import { createMockContext } from "../utils";

describe("Category Router", () => {
    const mockUser = {
        id: "test-user-id",
        testMode: false
    };

    const userCategoryId = "123e4567-e89b-12d3-a456-426614174000";
    const defaultCategoryId = "123e4567-e89b-12d3-a456-426614174001";

    test("list should return both default and user categories", async () => {
        const mockCategories = [
            { id: defaultCategoryId, name: "Food", userId: null },
            { id: userCategoryId, name: "My Custom", userId: "test-user-id" }
        ];

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
                categories: {
                    findMany: mock(() => Promise.resolve(mockCategories)),
                }
            },
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = categoryRouter.createCaller(ctx);
        const result = await caller.list();
        
        expect(result).toHaveLength(2);
        expect(mockDb.query.categories.findMany).toHaveBeenCalled();
    });

    test("create should insert user category", async () => {
        const newCategory = {
            id: userCategoryId,
            name: "New Cat",
            icon: "🍔",
            color: "#FF0000",
            userId: "test-user-id"
        };

        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
            },
            insert: mock(() => ({
                values: mock(() => ({
                    returning: mock(() => Promise.resolve([newCategory]))
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = categoryRouter.createCaller(ctx);
        
        const result = await caller.create({
            name: "New Cat",
            icon: "🍔",
            color: "#FF0000"
        });

        expect(result).toMatchObject(newCategory);
        expect(mockDb.insert).toHaveBeenCalled();
    });

    test("update should fail if category is not owned", async () => {
        const mockDb = {
            query: {
                users: {
                    findFirst: mock(() => Promise.resolve(mockUser)),
                },
            },
            update: mock(() => ({
                set: mock(() => ({
                    where: mock(() => ({
                        returning: mock(() => Promise.resolve([])) // Nothing updated
                    }))
                }))
            }))
        };

        const ctx = createMockContext({ db: mockDb as any });
        const caller = categoryRouter.createCaller(ctx);

        let error;
        try {
            await caller.update({
                id: defaultCategoryId,
                name: "Trying to change default"
            });
        } catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
        expect((error as Error).message).toBe('Category not found or cannot be modified');
    });
});
