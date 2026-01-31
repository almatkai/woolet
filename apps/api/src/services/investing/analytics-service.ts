import { db } from '../../db';
import { portfolioHoldings, investmentTransactions, investmentCashBalances } from '../../db/schema';
import { priceService } from './price-service';
import { getTwelveDataService } from './twelve-data';
import { investingCache, INVESTING_CACHE_KEYS, INVESTING_CACHE_TTL } from '../../lib/investing-cache';
import { eq, and, asc } from 'drizzle-orm';
import type { PortfolioSummary, HoldingSummary, PortfolioChartPoint, BenchmarkComparison } from '@woolet/shared';

export class AnalyticsService {
    private twelveData = getTwelveDataService();

    /**
     * Calculate portfolio summary with current P/L
     * Uses LRU cache with 15-minute TTL
     */
    async calculatePortfolioSummary(userId: string): Promise<PortfolioSummary> {
        const cacheKey = INVESTING_CACHE_KEYS.portfolioSummary(userId);

        return await investingCache.getOrFetch<PortfolioSummary>(
            cacheKey,
            async () => {
                // Get all holdings with stock details
                const holdings = await db.query.portfolioHoldings.findMany({
                    where: eq(portfolioHoldings.userId, userId),
                    with: {
                        stock: true,
                    },
                });

                // Get all transactions for realized P/L
                const transactions = await db.query.investmentTransactions.findMany({
                    where: eq(investmentTransactions.userId, userId),
                });

                let totalInvested = 0;
                let currentValue = 0;
                let realizedPL = 0;

                // Calculate realized P/L from sell transactions
                for (const tx of transactions) {
                    if (tx.type === 'buy') {
                        totalInvested += parseFloat(tx.totalAmount);
                    } else if (tx.type === 'sell' && tx.realizedPL) {
                        realizedPL += parseFloat(tx.realizedPL);
                    }
                }

                // Calculate current value and unrealized P/L for each holding
                const holdingSummaries: HoldingSummary[] = [];

                for (const holding of holdings) {
                    const quantity = parseFloat(holding.quantity);
                    const averageCostBasis = parseFloat(holding.averageCostBasis);
                    const { price: currentPrice, date: priceDate } = await priceService.getLatestPrice(holding.stockId);

                    const holdingCurrentValue = quantity * currentPrice;
                    const holdingCostBasis = quantity * averageCostBasis;
                    const holdingUnrealizedPL = holdingCurrentValue - holdingCostBasis;
                    const holdingUnrealizedPLPercent = holdingCostBasis > 0 ? (holdingUnrealizedPL / holdingCostBasis) * 100 : 0;

                    currentValue += holdingCurrentValue;

                    // Calculate staleness (older than 3 days)
                    const priceDateObj = new Date(priceDate);
                    const today = new Date();
                    const diffTime = Math.abs(today.getTime() - priceDateObj.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const isStale = diffDays > 3;

                    holdingSummaries.push({
                        stockId: holding.stockId,
                        ticker: holding.stock.ticker,
                        name: holding.stock.name,
                        quantity,
                        averageCostBasis,
                        currentPrice,
                        currentValue: holdingCurrentValue,
                        unrealizedPL: holdingUnrealizedPL,
                        unrealizedPLPercent: holdingUnrealizedPLPercent,
                        currency: holding.stock.currency,
                        isManual: holding.stock.isManual,
                        lastUpdated: priceDate,
                        isStale,
                    });
                }

                // Get investment cash balances
                const cashBalances = await db.query.investmentCashBalances.findMany({
                    where: eq(investmentCashBalances.userId, userId),
                });

                const cashByCurrency: Record<string, { available: number; settled: number }> = {};
                let totalCash = 0;

                for (const cash of cashBalances) {
                    const available = parseFloat(cash.availableBalance);
                    const settled = parseFloat(cash.settledBalance);
                    cashByCurrency[cash.currency] = { available, settled };
                    totalCash += available; // Use available cash for total
                }

                const unrealizedPL = currentValue - (totalInvested - realizedPL);
                const unrealizedPLPercent = totalInvested > 0 ? (unrealizedPL / totalInvested) * 100 : 0;
                const totalReturn = unrealizedPL + realizedPL;
                const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

                // Enhanced portfolio calculations
                const totalPortfolioValue = currentValue + totalCash;
                const cashAllocationPercent = totalPortfolioValue > 0 ? (totalCash / totalPortfolioValue) * 100 : 0;

                return {
                    totalInvested,
                    currentValue,
                    unrealizedPL,
                    unrealizedPLPercent,
                    realizedPL,
                    totalReturn,
                    totalReturnPercent,
                    holdings: holdingSummaries,
                    // NEW cash fields
                    cash: {
                        availableBalance: Object.fromEntries(
                            Object.entries(cashByCurrency).map(([currency, balances]) => [currency, balances.available])
                        ),
                        settledBalance: Object.fromEntries(
                            Object.entries(cashByCurrency).map(([currency, balances]) => [currency, balances.settled])
                        ),
                        totalCash,
                    },
                    // Enhanced totals
                    totalPortfolioValue,
                    stockValue: currentValue, // Same as currentValue for clarity
                    cashAllocationPercent,
                };
            },
            INVESTING_CACHE_TTL.portfolioSummary
        );
    }

    /**
     * Calculate realized P/L for a sell transaction using FIFO
     */
    async calculateRealizedPL(
        userId: string,
        stockId: string,
        sellQuantity: number,
        sellPricePerShare: number
    ): Promise<number> {
        // Get all buy transactions for this stock, oldest first (FIFO)
        const buyTransactions = await db.query.investmentTransactions.findMany({
            where: and(
                eq(investmentTransactions.userId, userId),
                eq(investmentTransactions.stockId, stockId),
                eq(investmentTransactions.type, 'buy')
            ),
            orderBy: asc(investmentTransactions.date),
        });

        let remainingToSell = sellQuantity;
        let totalCostBasis = 0;

        for (const buyTx of buyTransactions) {
            if (remainingToSell <= 0) break;

            const buyQuantity = parseFloat(buyTx.quantity);
            const buyPrice = parseFloat(buyTx.pricePerShare);

            const quantityFromThisBuy = Math.min(remainingToSell, buyQuantity);
            totalCostBasis += quantityFromThisBuy * buyPrice;
            remainingToSell -= quantityFromThisBuy;
        }

        const sellProceeds = sellQuantity * sellPricePerShare;
        const realizedPL = sellProceeds - totalCostBasis;

        return realizedPL;
    }

    /**
     * Generate portfolio value chart over time
     * Uses LRU cache with 1-hour TTL
     */
    async getPortfolioChart(
        userId: string,
        range: string
    ): Promise<PortfolioChartPoint[]> {
        const cacheKey = INVESTING_CACHE_KEYS.portfolioChart(userId, range);

        return await investingCache.getOrFetch<PortfolioChartPoint[]>(
            cacheKey,
            async () => {
                const { start, end } = priceService.getDateRange(range);

                // Get all holdings
                const holdings = await db.query.portfolioHoldings.findMany({
                    where: eq(portfolioHoldings.userId, userId),
                });

                if (holdings.length === 0) {
                    return [];
                }

                // Get price history for each holding
                const priceDataByStock = new Map<string, Map<string, number>>();
                const allDatesSet = new Set<string>();

                for (const holding of holdings) {
                    const prices = await priceService.getStockPrices(
                        holding.stockId,
                        start,
                        end
                    );
                    const stockPriceMap = new Map<string, number>();
                    for (const p of prices) {
                        stockPriceMap.set(p.date, p.close);
                        allDatesSet.add(p.date);
                    }
                    priceDataByStock.set(holding.stockId, stockPriceMap);
                }

                // Sort unique dates
                const sortedDates = Array.from(allDatesSet).sort((a, b) => a.localeCompare(b));

                // Calculate portfolio value for each date with forward-filling
                const chartData: PortfolioChartPoint[] = [];
                const lastKnownPrices = new Map<string, number>();

                for (const date of sortedDates) {
                    let dayTotalValue = 0;

                    for (const holding of holdings) {
                        const quantity = parseFloat(holding.quantity);
                        const stockPrices = priceDataByStock.get(holding.stockId);
                        const priceForDate = stockPrices?.get(date);

                        if (priceForDate !== undefined) {
                            lastKnownPrices.set(holding.stockId, priceForDate);
                            dayTotalValue += quantity * priceForDate;
                        } else {
                            // Use last known price if missing for this date
                            const lastPrice = lastKnownPrices.get(holding.stockId) || 0;
                            dayTotalValue += quantity * lastPrice;
                        }
                    }

                    chartData.push({ date, value: dayTotalValue });
                }

                return chartData;
            },
            INVESTING_CACHE_TTL.portfolioChart
        );
    }

    /**
     * Compare portfolio performance against a benchmark (default SPY)
     */
    async getPortfolioBenchmarkComparison(
        userId: string,
        range: string,
        benchmarkTicker: string = 'SPY'
    ): Promise<BenchmarkComparison> {
        const cacheKey = INVESTING_CACHE_KEYS.portfolioBenchmark(userId, benchmarkTicker, range);

        return await investingCache.getOrFetch<BenchmarkComparison>(
            cacheKey,
            async () => {
                const portfolioChart = await this.getPortfolioChart(userId, range);

                if (portfolioChart.length === 0) {
                    return {
                        portfolio: {
                            startValue: 0,
                            endValue: 0,
                            return: 0,
                            returnPercent: 0,
                            chartData: [],
                        },
                        benchmark: {
                            startValue: 0,
                            endValue: 0,
                            return: 0,
                            returnPercent: 0,
                            chartData: [],
                        },
                    };
                }

                const { start, end } = priceService.getDateRange(range);
                const benchmarkPrices = await this.twelveData.getDailyPrices(benchmarkTicker, start, end);

                const portfolioMap = new Map<string, number>();
                for (const point of portfolioChart) {
                    portfolioMap.set(point.date, point.value);
                }

                const benchmarkMap = new Map<string, number>();
                for (const price of benchmarkPrices) {
                    benchmarkMap.set(price.date, price.close);
                }

                const sharedDates = Array.from(portfolioMap.keys())
                    .filter((date) => benchmarkMap.has(date))
                    .sort((a, b) => a.localeCompare(b));

                if (sharedDates.length === 0) {
                    return {
                        portfolio: {
                            startValue: 0,
                            endValue: 0,
                            return: 0,
                            returnPercent: 0,
                            chartData: [],
                        },
                        benchmark: {
                            startValue: 0,
                            endValue: 0,
                            return: 0,
                            returnPercent: 0,
                            chartData: [],
                        },
                    };
                }

                const normalizeSeries = (valuesByDate: Map<string, number>) => {
                    const startValue = valuesByDate.get(sharedDates[0]) ?? 0;
                    const endValue = valuesByDate.get(sharedDates[sharedDates.length - 1]) ?? 0;
                    const absoluteReturn = endValue - startValue;
                    const returnPercent = startValue > 0 ? (absoluteReturn / startValue) * 100 : 0;

                    const chartData: PortfolioChartPoint[] = sharedDates.map((date) => {
                        const value = valuesByDate.get(date) ?? startValue;
                        const normalized = startValue > 0 ? ((value - startValue) / startValue) * 100 : 0;
                        return { date, value: normalized };
                    });

                    return {
                        startValue,
                        endValue,
                        return: absoluteReturn,
                        returnPercent,
                        chartData,
                    };
                };

                return {
                    portfolio: normalizeSeries(portfolioMap),
                    benchmark: normalizeSeries(benchmarkMap),
                };
            },
            INVESTING_CACHE_TTL.portfolioBenchmark,
            benchmarkTicker
        );
    }

    /**
     * Invalidate portfolio cache when data changes
     */
    async invalidatePortfolioCache(userId: string): Promise<void> {
        await investingCache.invalidatePattern(`portfolio:${userId}`);
    }
}

export const analyticsService = new AnalyticsService();

interface StockPrice {
    date: string;
    close: number;
}
