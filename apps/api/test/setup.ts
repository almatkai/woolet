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
        userDashboard: (userId: string) => `dashboard:${userId}`,
        monthlyReport: (userId: string, year: number, month: number) =>
            `report:${userId}:${year}:${month}`,
        categories: (userId: string) => `categories:${userId}`,
        accounts: (userId: string) => `accounts:${userId}`,
        hierarchy: (userId: string) => `hierarchy:${userId}`,
        exchangeRate: (from: string, to: string) => `rate:${from}:${to}`,
        CURRENCY_RATES: 'currency:rates',
        stockQuote: (id: string) => `quote:${id}`,
        stockQuoteByTicker: (ticker: string) => `invest:quote:ticker:${ticker.toUpperCase()}`,
        stockSearch: (q: string) => `search:${q}`,
        stockPrices: (t: string) => `prices:${t}`,
        stockEOD: (t: string, d: string) => `eod:${t}:${d}`,
        stockPriceRange: (stockId: string, range: string) => `invest:prices:${stockId}:${range}`,
        stockPricesRaw: (ticker: string, start?: string, end?: string, size?: number) =>
            `invest:prices:raw:${ticker.toUpperCase()}:${start || 'ALL'}:${end || 'LATEST'}:${size || 5000}`,
        benchmarkPrice: (benchmarkId: string, range: string) => `invest:benchmark:${benchmarkId}:${range}`,
        portfolioSummary: (userId: string) => `invest:portfolio:${userId}:summary`,
        portfolioChart: (userId: string, range: string) => `invest:portfolio:${userId}:chart:${range}`,
        marketDigestDaily: (userId: string, date: string) => `invest:digest:daily:${userId}:${date}`,
        marketDigestCustom: (userId: string, date: string, specsHash: string) =>
            `invest:digest:custom:${userId}:${date}:${specsHash}`,
        spendingStats: (userId: string, startDate: string, endDate: string, categoryIds?: string[]) =>
            `spending:${userId}:${startDate}:${endDate}:${(categoryIds || []).sort().join(',')}`,
    },
    CACHE_TTL: {
        dashboard: 60 * 5,
        monthlyReport: 60 * 60,
        categories: 60 * 30,
        accounts: 60 * 10,
        hierarchy: 60 * 10,
        exchangeRate: 60 * 60,
        spendingStats: 60 * 30,
        stockSearch: 60 * 60 * 24,
        stockQuote: 60 * 60 * 24,
        stockPriceHistoric: 60 * 60 * 24 * 7,
        stockPricesRaw: 60 * 60 * 24,
        portfolioSummary: 60 * 15,
        portfolioChart: 60 * 60,
        marketDigestDaily: 60 * 60 * 24,
        marketDigestCustom: 60 * 60 * 24,
        quote: 100,
    }
}));

// Mock Clerk Auth
mock.module("@hono/clerk-auth", () => ({
    getAuth: mock(() => ({
        userId: 'test-user-id',
        sessionClaims: {
            email: 'woolet.app@gmail.com',
            name: 'Test User',
        },
        has: mock(() => false),
    })),
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
