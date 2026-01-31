import { redis } from './redis';

/**
 * LRU Cache for Investment Data
 * 
 * Features:
 * - LRU eviction policy (max 1000 entries)
 * - 24-hour TTL for all entries
 * - Stale-while-revalidate pattern
 * - Cache statistics tracking
 */

// Cache configuration
const MAX_CACHE_SIZE = 1000;
const DEFAULT_TTL = 60 * 60 * 24; // 24 hours
const STALE_THRESHOLD = 60 * 60 * 48; // 48 hours (after this, data is too old)

// Cache keys
const CACHE_PREFIX = 'invest:lru:';
const STATS_KEY = 'invest:cache:stats';
const LRU_ORDER_KEY = 'invest:lru:order';
const REFRESH_QUEUE_KEY = 'invest:refresh:queue';

export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    hitRate: number;
}

interface CacheEntry<T> {
    data: T;
    createdAt: number;
    lastAccessedAt: number;
    ttl: number;
    ticker?: string; // For refresh queue tracking
}

interface RefreshCallback<T> {
    (): Promise<T>;
}

class InvestingCache {
    /**
     * Get data from cache, or fetch from source if not cached
     * Implements stale-while-revalidate pattern
     */
    async getOrFetch<T>(
        key: string,
        fetchFn: RefreshCallback<T>,
        ttl: number = DEFAULT_TTL,
        ticker?: string
    ): Promise<T> {
        const fullKey = this.getFullKey(key);

        try {
            // Try to get from cache
            const cached = await this.get<T>(fullKey);

            if (cached) {
                const now = Date.now();
                const age = now - cached.createdAt;

                // If data is fresh (within TTL), return it
                if (age < ttl * 1000) {
                    await this.recordHit();
                    await this.updateAccessTime(fullKey, cached);
                    return cached.data;
                }

                // If data is stale but not too old, return it and refresh in background
                if (age < STALE_THRESHOLD * 1000) {
                    await this.recordHit();
                    // Refresh in background (don't await)
                    this.refreshInBackground(fullKey, fetchFn, ttl, ticker);
                    return cached.data;
                }
            }

            // Cache miss - fetch fresh data
            await this.recordMiss();
            const freshData = await fetchFn();
            await this.set(fullKey, freshData, ttl, ticker);

            return freshData;
        } catch (error) {
            // On error, try to return stale data if available
            const staleData = await this.get<T>(fullKey);
            if (staleData) {
                console.warn(`[InvestingCache] Error fetching, returning stale data for ${key}:`, error);
                return staleData.data;
            }
            throw error;
        }
    }

    /**
     * Get cached entry
     */
    private async get<T>(fullKey: string): Promise<CacheEntry<T> | null> {
        try {
            const data = await redis.get(fullKey);
            if (!data) return null;
            return JSON.parse(data) as CacheEntry<T>;
        } catch {
            return null;
        }
    }

    /**
     * Set cache entry with LRU tracking
     */
    private async set<T>(
        fullKey: string,
        data: T,
        ttl: number,
        ticker?: string
    ): Promise<void> {
        const entry: CacheEntry<T> = {
            data,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            ttl,
            ticker,
        };

        // Ensure LRU size limit
        await this.enforceSizeLimit();

        // Store the entry
        await redis.setex(fullKey, STALE_THRESHOLD, JSON.stringify(entry));

        // Track in LRU order (sorted set with timestamp as score)
        await redis.zadd(LRU_ORDER_KEY, Date.now(), fullKey);

        // Add ticker to refresh queue if provided
        if (ticker) {
            await redis.sadd(REFRESH_QUEUE_KEY, ticker);
        }
    }

    /**
     * Update access time for LRU tracking
     */
    private async updateAccessTime<T>(fullKey: string, entry: CacheEntry<T>): Promise<void> {
        entry.lastAccessedAt = Date.now();
        await redis.setex(fullKey, STALE_THRESHOLD, JSON.stringify(entry));
        await redis.zadd(LRU_ORDER_KEY, Date.now(), fullKey);
    }

    /**
     * Refresh data in background (stale-while-revalidate)
     */
    private async refreshInBackground<T>(
        fullKey: string,
        fetchFn: RefreshCallback<T>,
        ttl: number,
        ticker?: string
    ): Promise<void> {
        try {
            const freshData = await fetchFn();
            await this.set(fullKey, freshData, ttl, ticker);
            console.log(`[InvestingCache] Background refresh complete for ${fullKey}`);
        } catch (error) {
            console.error(`[InvestingCache] Background refresh failed for ${fullKey}:`, error);
        }
    }

    /**
     * Enforce LRU size limit by evicting oldest entries
     */
    private async enforceSizeLimit(): Promise<void> {
        const size = await redis.zcard(LRU_ORDER_KEY);

        if (size >= MAX_CACHE_SIZE) {
            // Get the oldest entries (lowest scores)
            const toEvict = size - MAX_CACHE_SIZE + 1;
            const oldest = await redis.zrange(LRU_ORDER_KEY, 0, toEvict - 1);

            if (oldest.length > 0) {
                // Delete the cache entries
                await redis.del(...oldest);

                // Remove from LRU order
                await redis.zrem(LRU_ORDER_KEY, ...oldest);

                // Update eviction stats
                await this.recordEvictions(oldest.length);

                console.log(`[InvestingCache] Evicted ${oldest.length} entries`);
            }
        }
    }

    /**
     * Get full cache key with prefix
     */
    private getFullKey(key: string): string {
        if (key.startsWith(CACHE_PREFIX)) {
            return key;
        }
        return `${CACHE_PREFIX}${key}`;
    }

    /**
     * Record a cache hit
     */
    private async recordHit(): Promise<void> {
        await redis.hincrby(STATS_KEY, 'hits', 1);
    }

    /**
     * Record a cache miss
     */
    private async recordMiss(): Promise<void> {
        await redis.hincrby(STATS_KEY, 'misses', 1);
    }

    /**
     * Record evictions
     */
    private async recordEvictions(count: number): Promise<void> {
        await redis.hincrby(STATS_KEY, 'evictions', count);
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<CacheStats> {
        const stats = await redis.hgetall(STATS_KEY);
        const size = await redis.zcard(LRU_ORDER_KEY);

        const hits = parseInt(stats.hits || '0', 10);
        const misses = parseInt(stats.misses || '0', 10);
        const evictions = parseInt(stats.evictions || '0', 10);
        const total = hits + misses;

        return {
            hits,
            misses,
            evictions,
            size,
            hitRate: total > 0 ? (hits / total) * 100 : 0,
        };
    }

    /**
     * Get all tickers in the refresh queue
     */
    async getRefreshQueue(): Promise<string[]> {
        const tickers = await redis.smembers(REFRESH_QUEUE_KEY);
        return tickers;
    }

    /**
     * Clear a specific cache entry
     */
    async invalidate(key: string): Promise<void> {
        const fullKey = this.getFullKey(key);
        await redis.del(fullKey);
        await redis.zrem(LRU_ORDER_KEY, fullKey);
    }

    /**
     * Clear all cache entries with a pattern
     */
    async invalidatePattern(pattern: string): Promise<void> {
        const keys = await redis.keys(`${CACHE_PREFIX}${pattern}*`);
        if (keys.length > 0) {
            await redis.del(...keys);
            await redis.zrem(LRU_ORDER_KEY, ...keys);
        }
    }

    /**
     * Clear all investment cache
     */
    async clearAll(): Promise<void> {
        const keys = await redis.keys(`${CACHE_PREFIX}*`);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
        await redis.del(LRU_ORDER_KEY);
        await redis.del(STATS_KEY);
        await redis.del(REFRESH_QUEUE_KEY);
    }

    /**
     * Reset statistics
     */
    async resetStats(): Promise<void> {
        await redis.del(STATS_KEY);
    }
}

// Export singleton instance
export const investingCache = new InvestingCache();

// Cache key builders for investment data
export const INVESTING_CACHE_KEYS = {
    stockSearch: (query: string) => `search:${query.toLowerCase().trim()}`,
    stockQuote: (ticker: string) => `quote:${ticker.toUpperCase()}`,
    stockPrices: (ticker: string, start?: string, end?: string, size?: number) =>
        `prices:${ticker.toUpperCase()}:${start || 'ALL'}:${end || 'LATEST'}:${size || 5000}`,
    stockEOD: (ticker: string, date: string) => `eod:${ticker.toUpperCase()}:${date}`,
    portfolioSummary: (userId: string) => `portfolio:${userId}:summary`,
    portfolioChart: (userId: string, range: string) => `portfolio:${userId}:chart:${range}`,
    portfolioBenchmark: (userId: string, benchmarkTicker: string, range: string) =>
        `portfolio:${userId}:benchmark:${benchmarkTicker.toUpperCase()}:${range}`,
};

// Cache TTL constants (in seconds)
export const INVESTING_CACHE_TTL = {
    search: 60 * 60 * 24,           // 24 hours - stock symbols rarely change
    quote: 60 * 60 * 24,            // 24 hours - EOD data refreshes daily
    prices: 60 * 60 * 24,           // 24 hours - historical prices don't change
    pricesRecent: 60 * 60 * 4,      // 4 hours - recent prices may update
    eod: 60 * 60 * 24 * 7,          // 7 days - historical EOD is permanent
    portfolioSummary: 60 * 15,      // 15 minutes - user may want fresh data
    portfolioChart: 60 * 60,        // 1 hour - chart data
    portfolioBenchmark: 60 * 60,    // 1 hour - benchmark comparison
};
