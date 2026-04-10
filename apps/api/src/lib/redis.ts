import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redis.on('connect', () => {
    console.log('✅ Connected to Redis');
});

// Cache helper functions
export const cache = {
    async get<T>(key: string): Promise<T | null> {
        try {
            const data = await redis.get(key);
            if (!data) return null;
            return JSON.parse(data) as T;
        } catch (err) {
            console.warn(`Redis get failed for key "${key}":`, err);
            return null;
        }
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        try {
            const data = JSON.stringify(value);
            if (ttlSeconds) {
                await redis.setex(key, ttlSeconds, data);
            } else {
                await redis.set(key, data);
            }
        } catch (err) {
            console.warn(`Redis set failed for key "${key}":`, err);
        }
    },

    async del(key: string): Promise<void> {
        try {
            await redis.del(key);
        } catch (err) {
            console.warn(`Redis del failed for key "${key}":`, err);
        }
    },

    async invalidatePattern(pattern: string): Promise<void> {
        try {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (err) {
            console.warn(`Redis invalidatePattern failed for "${pattern}":`, err);
        }
    },
};

// Cache key builders
export const CACHE_KEYS = {
    userDashboard: (userId: string) => `dashboard:${userId}`,
    monthlyReport: (userId: string, year: number, month: number) =>
        `report:${userId}:${year}:${month}`,
    categories: (userId: string) => `categories:${userId}`,
    accounts: (userId: string) => `accounts:${userId}`,
    hierarchy: (userId: string) => `hierarchy:${userId}`,
    exchangeRate: (from: string, to: string) => `rate:${from}:${to}`,
    
    // Currency exchange rates
    CURRENCY_RATES: 'currency:rates',
    
    // Investing module (Twelve Data)
    stockSearch: (query: string) => `invest:search:${query.toLowerCase()}`,
    stockQuote: (stockId: string) => `invest:quote:${stockId}`,
    stockQuoteByTicker: (ticker: string) => `invest:quote:ticker:${ticker.toUpperCase()}`,
    stockEOD: (ticker: string, date: string) => `invest:eod:${ticker.toUpperCase()}:${date}`,
    stockPriceRange: (stockId: string, range: string) => `invest:prices:${stockId}:${range}`,
    stockPricesRaw: (ticker: string, start?: string, end?: string, size?: number) => 
        `invest:prices:raw:${ticker.toUpperCase()}:${start || 'ALL'}:${end || 'LATEST'}:${size || 5000}`,
    benchmarkPrice: (benchmarkId: string, range: string) => `invest:benchmark:${benchmarkId}:${range}`,
    portfolioSummary: (userId: string) => `invest:portfolio:${userId}:summary`,
    portfolioChart: (userId: string, range: string) => `invest:portfolio:${userId}:chart:${range}`,
    marketDigestDaily: (userId: string, date: string) => `invest:digest:daily:${userId}:${date}`,
    marketDigestCustom: (userId: string, date: string, specsHash: string) => `invest:digest:custom:${userId}:${date}:${specsHash}`,
    spendingStats: (userId: string, startDate: string, endDate: string, categoryIds?: string[]) =>
        `spending:${userId}:${startDate}:${endDate}:${(categoryIds || []).sort().join(',')}`,
};

export const CACHE_TTL = {
    dashboard: 60 * 5,      // 5 minutes
    monthlyReport: 60 * 60, // 1 hour
    categories: 60 * 30,    // 30 minutes
    accounts: 60 * 10,      // 10 minutes
    hierarchy: 60 * 10,     // 10 minutes
    exchangeRate: 60 * 60,  // 1 hour
    spendingStats: 60 * 30, // 30 minutes
    
    // Investing module
    stockSearch: 60 * 60 * 24,      // 24 hours (stock symbols rarely change)
    stockQuote: 60 * 60 * 24,       // 24 hours (Daily update)
    stockPriceHistoric: 60 * 60 * 24 * 7, // 7 days (historical data doesn't change)
    stockPricesRaw: 60 * 60 * 24,   // 24 hours
    portfolioSummary: 60 * 15,      // 15 minutes
    portfolioChart: 60 * 60,        // 1 hour
    marketDigestDaily: 60 * 60 * 24, // 24 hours
    marketDigestCustom: 60 * 60 * 24, // 24 hours
};
