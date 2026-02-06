import { mock } from 'bun:test';
import type { Context } from '../src/lib/trpc';

export const createMockContext = (overrides: Partial<Context> = {}): Context => {
    const defaultUser = {
        id: overrides.userId || 'test-user-id',
        email: 'woolet.app@gmail.com',
        name: 'Test User',
        defaultCurrency: 'USD',
        subscriptionTier: 'free',
        testMode: false,
        ...(overrides.user || {})
    };

    const dbOverrides = (overrides.db || {}) as any;
    const queryOverrides = dbOverrides.query || {};

    const dbMock: any = {
        insert: mock(() => ({
            values: mock(() => ({
                returning: mock(() => Promise.resolve([{ id: 'test-id' }])),
            })),
        })),
        update: mock(() => ({
            set: mock(() => ({
                where: mock(() => ({
                    returning: mock(() => Promise.resolve([])),
                })),
            })),
        })),
        select: mock(() => ({
            from: mock(() => ({
                where: mock(() => ({
                    limit: mock(() => Promise.resolve([{ count: 0 }])),
                    offset: mock(() => Promise.resolve([{ count: 0 }])),
                    orderBy: mock(() => Promise.resolve([{ count: 0 }])),
                    then: (onfulfilled: any) => Promise.resolve([{ count: 0 }]).then(onfulfilled),
                })),
                then: (onfulfilled: any) => Promise.resolve([{ count: 0 }]).then(onfulfilled),
            })),
        })),
        delete: mock(() => ({
            where: mock(() => Promise.resolve()),
        })),
        ...dbOverrides,
        query: new Proxy(queryOverrides, {
            get: (target, table) => {
                const tableKey = table as string;
                const existing = target[tableKey] || {};
                return {
                    findFirst: mock(() => {
                        if (table === 'users') return Promise.resolve(defaultUser);
                        if (table === 'investmentCashBalances') return Promise.resolve({
                            id: 'test-cash-id',
                            availableBalance: '10000',
                            currency: 'USD'
                        });
                        if (table === 'currencyBalances') return Promise.resolve({
                            id: 'test-balance-id',
                            balance: '10000',
                            currencyCode: 'USD',
                            accountId: 'test-account-id'
                        });
                        return Promise.resolve(null);
                    }),
                    findMany: existing.findMany || mock(() => Promise.resolve([])),
                    ...existing,
                };
            }
        }),
    };

    // console.log('DEBUG: dbMock.query keys:', Object.keys(dbMock.query));

    return {
        userId: overrides.userId || 'test-user-id',
        user: defaultUser,
        honoContext: {
            get: mock((key: string) => {
                if (key === 'clerkAuth') {
                    return {
                        userId: 'test-user-id',
                        sessionClaims: {
                            email: 'woolet.app@gmail.com',
                            name: 'Test User',
                        },
                    };
                }
                return null;
            }),
        } as any,
        ...overrides,
        db: dbMock as any,
    };
};
