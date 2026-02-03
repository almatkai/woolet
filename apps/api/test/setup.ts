import { mock } from "bun:test";

console.log("DEBUG: Loading test setup...");

// Mock the database globally
mock.module("../src/db", () => ({
    db: {
        query: {
            users: { findFirst: mock(() => Promise.resolve({ id: 'test-user-id', email: 'woolet.app@gmail.com' })) },
            stocks: { findFirst: mock(() => Promise.resolve(null)) },
            portfolioHoldings: { findFirst: mock(() => Promise.resolve(null)) },
            investmentTransactions: { findFirst: mock(() => Promise.resolve(null)) },
            stockPrices: { findFirst: mock(() => Promise.resolve(null)) },
        },
        insert: mock(() => ({
            values: mock(() => ({
                returning: mock(() => Promise.resolve([{ id: 'test-id' }]))
            }))
        })),
        update: mock(() => ({
            set: mock(() => ({
                where: mock(() => Promise.resolve([{ id: 'test-id' }]))
            }))
        })),
        delete: mock(() => ({
            where: mock(() => Promise.resolve([{ id: 'test-id' }]))
        })),
        select: mock(() => ({
            from: mock(() => ({
                where: mock(() => ({
                    orderBy: mock(() => ({
                        limit: mock(() => Promise.resolve([]))
                    }))
                }))
            }))
        })),
    }
}));

// Mock Redis fully
mock.module("../src/lib/redis", () => ({
    redis: {
        get: mock(() => Promise.resolve(null)),
        set: mock(() => Promise.resolve()),
        setex: mock(() => Promise.resolve()),
        del: mock(() => Promise.resolve()),
        keys: mock(() => Promise.resolve([])),
        on: mock(() => { }),
    },
    cache: {
        get: mock(() => Promise.resolve(null)),
        set: mock(() => Promise.resolve()),
        del: mock(() => Promise.resolve()),
        invalidatePattern: mock(() => Promise.resolve()),
    },
    CACHE_KEYS: {
        stockQuote: (id: string) => `quote:${id}`,
        stockSearch: (q: string) => `search:${q}`,
        stockPrices: (t: string) => `prices:${t}`,
        stockEOD: (t: string, d: string) => `eod:${t}:${d}`,
    },
    CACHE_TTL: {
        quote: 100,
    }
}));

// Mock TwelveDataService to avoid any fetch calls from it
mock.module("../src/services/investing/twelve-data", () => ({
    getTwelveDataService: () => ({
        searchStocks: mock(() => Promise.resolve([])),
        getQuote: mock(() => Promise.resolve({ close: 150, date: "2023-01-01", datetime: "2023-01-01" })),
        getDailyPrices: mock(() => Promise.resolve([{ date: "2023-01-01", close: 150 }])),
        getEODPrice: mock(() => Promise.resolve(150)),
    }),
}));

// Backup mock for fetch just in case
global.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ status: "ok", values: [] })))) as any;
