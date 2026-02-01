import { mock } from 'bun:test';
import type { Context } from '../src/lib/trpc';

export const createMockContext = (overrides: Partial<Context> = {}): Context => {
    const defaultUser = {
        id: overrides.userId || 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        defaultCurrency: 'USD',
        subscriptionTier: 'free',
        testMode: false,
        ...(overrides.user || {})
    };

    const dbMock: any = {
        query: {
            users: {
                findFirst: mock(() => Promise.resolve(defaultUser)),
            },
        },
        insert: mock(() => ({
            values: mock(() => ({
                returning: mock(() => Promise.resolve([{ id: 'test-user-id' }])),
            })),
        })),
        update: mock(() => ({
            set: mock(() => ({
                where: mock(() => ({
                    returning: mock(() => Promise.resolve([])),
                })),
            })),
        })),
        delete: mock(() => ({
            where: mock(() => Promise.resolve()),
        })),
    };

    if (overrides.db) {
        const { query, ...rest } = overrides.db as any;
        Object.assign(dbMock, rest);
        if (query) {
            dbMock.query = { ...dbMock.query, ...query };
        }
    }

    // console.log('DEBUG: dbMock.query keys:', Object.keys(dbMock.query));

    return {
        userId: overrides.userId || 'test-user-id',
        user: defaultUser,
        honoContext: {} as any,
        ...overrides,
        db: dbMock as any,
    };
};
