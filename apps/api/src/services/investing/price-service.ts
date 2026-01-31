import { db } from '../../db';
import { stocks, stockPrices } from '../../db/schema';
import { getTwelveDataService } from './twelve-data';
import { investingCache, INVESTING_CACHE_KEYS, INVESTING_CACHE_TTL } from '../../lib/investing-cache';
import { eq, and, gte, lte, asc, count, desc } from 'drizzle-orm';
import { cache, CACHE_KEYS, CACHE_TTL } from '../../lib/redis';
import type { StockPrice } from '@woolet/shared';

export class PriceService {
    private twelveData = getTwelveDataService();

    /**
     * Get stock prices for a date range
     * Uses database as permanent storage, LRU cache for hot data
     */
    async getStockPrices(
        stockId: string,
        startDate: string,
        endDate: string
    ): Promise<StockPrice[]> {
        // Cache key for this specific range query
        const cacheKey = `price-range:${stockId}:${startDate}:${endDate}`;

        return await investingCache.getOrFetch<StockPrice[]>(
            cacheKey,
            async () => {
                // Check database for this stock and date range
                const dbPrices = await db.query.stockPrices.findMany({
                    where: and(
                        eq(stockPrices.stockId, stockId),
                        gte(stockPrices.date, startDate),
                        lte(stockPrices.date, endDate)
                    ),
                    orderBy: asc(stockPrices.date),
                });

                // If we have data in DB, check if it's sufficient
                const mostRecentDbDate = dbPrices.length > 0 ? dbPrices[dbPrices.length - 1].date : null;
                const today = new Date().toISOString().split('T')[0];

                // Heuristic: If we have data and it's reasonably recent (within 3 days to account for weekends/holidays)
                // or if the data already covers the requested endDate, we can use the DB.
                const isDataSufficient = mostRecentDbDate && (
                    mostRecentDbDate >= endDate ||
                    mostRecentDbDate >= today ||
                    (new Date(endDate).getTime() - new Date(mostRecentDbDate).getTime()) < 3 * 24 * 60 * 60 * 1000
                );

                if (dbPrices.length > 0 && isDataSufficient) {
                    return dbPrices.map(p => ({
                        date: p.date,
                        open: parseFloat(p.open),
                        high: parseFloat(p.high),
                        low: parseFloat(p.low),
                        close: parseFloat(p.close),
                        adjustedClose: parseFloat(p.adjustedClose),
                        volume: parseInt(p.volume || '0', 10),
                    }));
                }

                // No data in DB, fetch from Twelve Data
                const stock = await db.query.stocks.findFirst({
                    where: eq(stocks.id, stockId),
                });

                if (!stock) {
                    throw new Error('Stock not found');
                }

                const newPrices = await this.twelveData.getDailyPrices(
                    stock.ticker,
                    startDate,
                    endDate
                );

                // Store in database (permanent)
                if (newPrices.length > 0) {
                    await db.insert(stockPrices).values(
                        newPrices.map(p => ({
                            stockId,
                            date: p.date,
                            open: p.open.toString(),
                            high: p.high.toString(),
                            low: p.low.toString(),
                            close: p.close.toString(),
                            adjustedClose: p.adjustedClose.toString(),
                            volume: p.volume.toString(),
                        }))
                    ).onConflictDoNothing();
                }

                return newPrices;
            },
            (() => {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                const isRecent = new Date(startDate) >= oneWeekAgo;
                return isRecent ? INVESTING_CACHE_TTL.pricesRecent : INVESTING_CACHE_TTL.prices;
            })()
        );
    }

    /**
     * Get latest price for a stock (with shorter cache TTL)
     */
    async getLatestPrice(stockId: string): Promise<{ price: number; date: string }> {
        const cacheKey = CACHE_KEYS.stockQuote(stockId);
        const cached = await cache.get<{ price: number; date: string }>(cacheKey);
        if (cached) return cached;

        const stock = await db.query.stocks.findFirst({
            where: eq(stocks.id, stockId),
        });

        if (!stock) {
            throw new Error('Stock not found');
        }

        let result: { price: number; date: string };

        if (stock.isManual) {
            // Fetch latest price from DB
            const latestPrice = await db.query.stockPrices.findFirst({
                where: eq(stockPrices.stockId, stockId),
                orderBy: desc(stockPrices.date),
            });

            if (latestPrice) {
                result = {
                    price: parseFloat(latestPrice.close),
                    date: latestPrice.date
                };
            } else {
                // Default if no price found (avoid division by zero or errors elsewhere)
                result = { price: 0, date: new Date().toISOString().split('T')[0] };
            }
        } else {
            // Fetch from API
            const quote = await this.twelveData.getQuote(stock.ticker);
            result = {
                price: quote.close,
                date: quote.date,
            };
        }

        // Cache for 24 hours
        await cache.set(cacheKey, result, CACHE_TTL.stockQuote);

        return result;
    }

    /**
     * Initial backfill when adding a new stock
     * Fetches maximum history (5000 days = ~20 years)
     */
    async backfillStockHistory(stockId: string, ticker: string): Promise<void> {
        // Check if we already have data
        const existingCount = await db
            .select({ count: count() })
            .from(stockPrices)
            .where(eq(stockPrices.stockId, stockId));

        if (existingCount[0].count > 0) {
            return; // Already backfilled
        }

        // Fetch maximum history (uses LRU cache internally)
        const prices = await this.twelveData.getDailyPrices(ticker);

        if (prices.length > 0) {
            await db.insert(stockPrices).values(
                prices.map(p => ({
                    stockId,
                    date: p.date,
                    open: p.open.toString(),
                    high: p.high.toString(),
                    low: p.low.toString(),
                    close: p.close.toString(),
                    adjustedClose: p.adjustedClose.toString(),
                    volume: p.volume.toString(),
                }))
            ).onConflictDoNothing();
        }
    }

    /**
     * Get date range for price queries based on range string
     */
    getDateRange(range: string): { start: string; end: string } {
        const end = new Date();
        const start = new Date();

        switch (range) {
            case '1D':
                start.setDate(end.getDate() - 1);
                break;
            case '1W':
                start.setDate(end.getDate() - 7);
                break;
            case '1M':
                start.setMonth(end.getMonth() - 1);
                break;
            case '3M':
                start.setMonth(end.getMonth() - 3);
                break;
            case '1Y':
                start.setFullYear(end.getFullYear() - 1);
                break;
            case '5Y':
                start.setFullYear(end.getFullYear() - 5);
                break;
            case 'MAX':
                start.setFullYear(end.getFullYear() - 20); // Maximum supported
                break;
            default:
                start.setFullYear(end.getFullYear() - 1);
        }

        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
        };
    }
}

export const priceService = new PriceService();
