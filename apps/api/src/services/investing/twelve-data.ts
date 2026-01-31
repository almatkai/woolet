import type { StockSearchResult, StockPrice } from '@woolet/shared';
import { investingCache, INVESTING_CACHE_KEYS, INVESTING_CACHE_TTL } from '../../lib/investing-cache';
import { db } from '../../db';
import { stocks, stockPrices } from '../../db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

const BASE_URL = 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVE_DATA!;

interface TwelveDataTimeSeriesResponse {
    meta: {
        symbol: string;
        interval: string;
        currency: string;
        exchange_timezone: string;
        exchange: string;
        type: string;
    };
    values: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
    }>;
    status: string;
}

interface TwelveDataSearchResponse {
    data: Array<{
        symbol: string;
        instrument_name: string;
        exchange: string;
        country: string;
        currency: string;
        type: string;
    }>;
    status: string;
}

interface TwelveDataQuoteResponse {
    symbol: string;
    name: string;
    exchange: string;
    currency: string;
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    previous_close: string;
}

export class TwelveDataService {
    private lastRequestTime = 0;

    /**
     * Rate limit helper (8 requests/minute = 7.5 seconds between requests)
     */
    private async rateLimitDelay(): Promise<void> {
        const minDelay = 7500; // 7.5 seconds
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minDelay) {
            await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }
        this.lastRequestTime = Date.now();
    }

    /**
     * Search for stocks by ticker or company name
     * Uses LRU cache with 24-hour TTL
     */
    async searchStocks(query: string): Promise<StockSearchResult[]> {
        const normalizedQuery = query.toLowerCase().trim();
        const cacheKey = INVESTING_CACHE_KEYS.stockSearch(normalizedQuery);

        return await investingCache.getOrFetch<StockSearchResult[]>(
            cacheKey,
            async () => {
                console.log(`[TwelveData] API call: searchStocks("${query}")`);
                await this.rateLimitDelay();

                const url = `${BASE_URL}/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${API_KEY}`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`Twelve Data API error: ${response.statusText}`);
                }

                const data = await response.json() as TwelveDataSearchResponse;

                if (data.status !== 'ok') {
                    throw new Error('Twelve Data API returned error status');
                }

                return data.data.map(item => ({
                    ticker: item.symbol,
                    name: item.instrument_name,
                    exchange: item.exchange,
                    currency: item.currency,
                }));
            },
            INVESTING_CACHE_TTL.search,
            undefined // No ticker for search queries
        );
    }

    /**
     * Get daily historical prices
     * Uses LRU cache with 24-hour TTL
     * 
     * @param ticker Stock ticker symbol
     * @param startDate Optional start date (YYYY-MM-DD), defaults to maximum history
     * @param endDate Optional end date (YYYY-MM-DD), defaults to today
     * @param outputSize Number of data points (default 5000, max 5000)
     */
    async getDailyPrices(
        ticker: string,
        startDate?: string,
        endDate?: string,
        outputSize: number = 5000,
        userId?: string
    ): Promise<StockPrice[]> {
        const cacheKey = INVESTING_CACHE_KEYS.stockPrices(ticker, startDate, endDate, outputSize);

        // Use shorter TTL for recent price data (within last week)
        const now = new Date();
        const oneWeekAgo = new Date(now);
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const isRecentData = !startDate || new Date(startDate) >= oneWeekAgo;
        const ttl = isRecentData ? INVESTING_CACHE_TTL.pricesRecent : INVESTING_CACHE_TTL.prices;

        // Try getting from DB first if userId is provided (Persistent Cache)
        let stockId: string | null = null;
        if (userId) {
            try {
                // Find the stock ID for this user
                const stock = await db.query.stocks.findFirst({
                    where: and(eq(stocks.userId, userId), eq(stocks.ticker, ticker)),
                });

                if (stock) {
                    stockId = stock.id;
                    const conditions = [eq(stockPrices.stockId, stock.id)];

                    if (startDate) {
                        conditions.push(gte(stockPrices.date, startDate));
                    }
                    if (endDate) {
                        conditions.push(lte(stockPrices.date, endDate));
                    }

                    const dbPrices = await db.select()
                        .from(stockPrices)
                        .where(and(...conditions))
                        .orderBy(desc(stockPrices.date))
                        .limit(outputSize);

                    // If we have substantial data, use it
                    const mostRecentDbDate = dbPrices.length > 0 ? dbPrices[0].date : null; // desc order, so index 0 is newest
                    const today = new Date().toISOString().split('T')[0];
                    const isDataSufficient = mostRecentDbDate && (
                        (endDate && mostRecentDbDate >= endDate) ||
                        mostRecentDbDate >= today ||
                        (new Date(endDate || today).getTime() - new Date(mostRecentDbDate).getTime()) < 3 * 24 * 60 * 60 * 1000
                    );

                    if (dbPrices.length > 0 && isDataSufficient) {
                        console.log(`[TwelveData] Database hit (` + dbPrices.length + ` records) for ${ticker}`);
                        return dbPrices.map(p => ({
                            date: p.date,
                            open: Number(p.open),
                            high: Number(p.high),
                            low: Number(p.low),
                            close: Number(p.close),
                            adjustedClose: Number(p.adjustedClose),
                            volume: Number(p.volume || 0),
                        }));
                    }
                }
            } catch (err) {
                console.error('[TwelveData] Database cache read failed:', err);
                // Fallback to API/Redis
            }
        }

        return await investingCache.getOrFetch<StockPrice[]>(
            cacheKey,
            async () => {
                console.log(`[TwelveData] API call: getDailyPrices("${ticker}", "${startDate}", "${endDate}", ${outputSize})`);
                await this.rateLimitDelay();

                let url = `${BASE_URL}/time_series?symbol=${ticker}&interval=1day&outputsize=${outputSize}&apikey=${API_KEY}`;

                if (startDate) url += `&start_date=${startDate}`;
                if (endDate) url += `&end_date=${endDate}`;

                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`Twelve Data API error: ${response.statusText}`);
                }

                const data = await response.json() as TwelveDataTimeSeriesResponse;

                if (data.status !== 'ok') {
                    throw new Error('Twelve Data API returned error status');
                }

                const prices = data.values.map(item => ({
                    date: item.datetime.split(' ')[0], // Extract date part
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close),
                    adjustedClose: parseFloat(item.close), // Twelve Data doesn't provide adjusted close in basic endpoint
                    volume: parseInt(item.volume, 10),
                }));

                // Save to DB in background if we have a stockId
                if (stockId) {
                    this.saveToDb(stockId, prices).catch(err =>
                        console.error('[TwelveData] Failed to save to DB:', err)
                    );
                }

                return prices;
            },
            ttl,
            ticker
        );
    }

    /**
     * Helper to save prices to DB
     */
    private async saveToDb(stockId: string, prices: StockPrice[]) {
        if (prices.length === 0) return;

        // Naive approach: Insert and ignore conflicts if possible, or check existence.
        // Since schema doesn't seem to have unique constraint on (stockId, date), 
        // we should delete existing overlap to avoid duplicates.

        try {
            const start = prices[prices.length - 1].date; // oldest
            const end = prices[0].date; // newest

            await db.delete(stockPrices)
                .where(and(
                    eq(stockPrices.stockId, stockId),
                    gte(stockPrices.date, start),
                    lte(stockPrices.date, end)
                ));

            // Batch insert
            // Postgres supports bulk insert
            // Map to schema format
            const values = prices.map(p => ({
                stockId,
                date: p.date,
                open: p.open.toString(),
                high: p.high.toString(),
                low: p.low.toString(),
                close: p.close.toString(),
                adjustedClose: p.adjustedClose.toString(),
                volume: p.volume.toString(),
            }));

            await db.insert(stockPrices).values(values);
            console.log(`[TwelveData] Saved ${values.length} prices to DB for stockId ${stockId}`);
        } catch (err) {
            console.error('[TwelveData] Error saving to DB:', err);
        }
    }

    /**
     * Get current/latest quote for a stock
     * Uses LRU cache with 24-hour TTL (EOD data updates once daily)
     */
    async getQuote(ticker: string): Promise<StockPrice> {
        const cacheKey = INVESTING_CACHE_KEYS.stockQuote(ticker);

        return await investingCache.getOrFetch<StockPrice>(
            cacheKey,
            async () => {
                console.log(`[TwelveData] API call: getQuote("${ticker}")`);
                await this.rateLimitDelay();

                const url = `${BASE_URL}/quote?symbol=${ticker}&apikey=${API_KEY}`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`Twelve Data API error: ${response.statusText}`);
                }

                const data = await response.json() as TwelveDataQuoteResponse;

                return {
                    date: data.datetime.split(' ')[0],
                    open: parseFloat(data.open),
                    high: parseFloat(data.high),
                    low: parseFloat(data.low),
                    close: parseFloat(data.close),
                    adjustedClose: parseFloat(data.close),
                    volume: parseInt(data.volume, 10),
                };
            },
            INVESTING_CACHE_TTL.quote,
            ticker
        );
    }

    /**
     * Get End-of-Day price for a specific date
     * Uses LRU cache with 7-day TTL (historical data doesn't change)
     */
    async getEODPrice(ticker: string, date: string): Promise<number> {
        const cacheKey = INVESTING_CACHE_KEYS.stockEOD(ticker, date);

        return await investingCache.getOrFetch<number>(
            cacheKey,
            async () => {
                console.log(`[TwelveData] API call: getEODPrice("${ticker}", "${date}")`);
                await this.rateLimitDelay();

                const url = `${BASE_URL}/eod?symbol=${ticker}&date=${date}&apikey=${API_KEY}`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`Twelve Data API error: ${response.statusText}`);
                }

                const data = await response.json() as { close?: string };

                if (!data.close) {
                    throw new Error(`No price data available for ${ticker} on ${date}`);
                }

                return parseFloat(data.close);
            },
            INVESTING_CACHE_TTL.eod,
            ticker
        );
    }
}

// Singleton instance
let twelveDataService: TwelveDataService;

export function getTwelveDataService(): TwelveDataService {
    if (!twelveDataService) {
        twelveDataService = new TwelveDataService();
    }
    return twelveDataService;
}
