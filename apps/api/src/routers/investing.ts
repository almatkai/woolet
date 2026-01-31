import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { stocks, stockPrices, portfolioHoldings, investmentTransactions, investmentCashBalances } from '../db/schema';
import { getTwelveDataService } from '../services/investing/twelve-data';
import { priceService } from '../services/investing/price-service';
import { analyticsService } from '../services/investing/analytics-service';
import { investingCache } from '../lib/investing-cache';
import { cache, CACHE_KEYS } from '../lib/redis';
import {
    stockSearchSchema,
    addStockSchema,
    buyStockSchema,
    sellStockSchema,
    portfolioRangeSchema,
    stockPriceRangeSchema,
    updateStockPriceSchema,
} from '@woolet/shared';

const twelveData = getTwelveDataService();

export const investingRouter = router({
    // Search for stocks
    searchStocks: protectedProcedure
        .input(stockSearchSchema)
        .query(async ({ input }) => {
            return await twelveData.searchStocks(input.query);
        }),

    // Add a stock to user's watchlist
    addStock: protectedProcedure
        .input(addStockSchema)
        .mutation(async ({ ctx, input }) => {
            // Check if stock already exists for user
            const existing = await ctx.db.query.stocks.findFirst({
                where: and(
                    eq(stocks.userId, ctx.userId!),
                    eq(stocks.ticker, input.ticker)
                ),
            });

            if (existing) {
                return existing;
            }

            // Create stock record
            const [stock] = await ctx.db.insert(stocks).values({
                userId: ctx.userId!,
                ticker: input.ticker,
                name: input.name,
                currency: input.currency,
                exchange: input.exchange,
                isManual: input.isManual || false,
            }).returning();

            // Backfill historical prices if not manual
            if (!stock.isManual) {
                await priceService.backfillStockHistory(stock.id, stock.ticker);
            }

            return stock;
        }),

    // Update price for manual stock
    updateManualPrice: protectedProcedure
        .input(updateStockPriceSchema)
        .mutation(async ({ ctx, input }) => {
            const { stockId, price, date } = input;

            // Verify stock ownership
            const stock = await ctx.db.query.stocks.findFirst({
                where: and(
                    eq(stocks.id, stockId),
                    eq(stocks.userId, ctx.userId!)
                ),
            });

            if (!stock) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Stock not found',
                });
            }

            // Check if price exists for this date
            const existing = await ctx.db.query.stockPrices.findFirst({
                where: and(
                    eq(stockPrices.stockId, stockId),
                    eq(stockPrices.date, date)
                ),
            });

            if (existing) {
                await ctx.db.update(stockPrices)
                    .set({
                        close: price.toString(),
                        adjustedClose: price.toString(),
                        open: price.toString(),
                        high: price.toString(),
                        low: price.toString(),
                        // We don't update volume for manual entries usually
                    })
                    .where(eq(stockPrices.id, existing.id));
            } else {
                await ctx.db.insert(stockPrices).values({
                    stockId,
                    date,
                    close: price.toString(),
                    adjustedClose: price.toString(),
                    open: price.toString(),
                    high: price.toString(),
                    low: price.toString(),
                    volume: '0',
                });
            }

            // Invalidate caches
            await investingCache.invalidatePattern(`invest:portfolio:${ctx.userId!}`);
            await cache.del(CACHE_KEYS.stockQuote(stockId));

            return { success: true };
        }),

    // Get portfolio summary
    getPortfolioSummary: protectedProcedure
        .query(async ({ ctx }) => {
            return await analyticsService.calculatePortfolioSummary(ctx.userId!);
        }),

    // Get portfolio chart data
    getPortfolioChart: protectedProcedure
        .input(portfolioRangeSchema)
        .query(async ({ ctx, input }) => {
            return await analyticsService.getPortfolioChart(ctx.userId!, input.range);
        }),

    // Compare portfolio vs benchmark (default S&P 500 via SPY)
    getBenchmarkComparison: protectedProcedure
        .input(portfolioRangeSchema)
        .query(async ({ ctx, input }) => {
            return await analyticsService.getPortfolioBenchmarkComparison(ctx.userId!, input.range);
        }),

    // Buy stock
    buyStock: protectedProcedure
        .input(buyStockSchema)
        .mutation(async ({ ctx, input }) => {
            const { stockId, date, quantity, pricePerShare, currency, notes } = input;

            // Verify stock ownership
            const stock = await ctx.db.query.stocks.findFirst({
                where: and(
                    eq(stocks.id, stockId),
                    eq(stocks.userId, ctx.userId!)
                ),
            });

            if (!stock) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Stock not found',
                });
            }

            const totalAmount = quantity * pricePerShare;

            // Check investment cash balance
            const existingCash = await ctx.db.query.investmentCashBalances.findFirst({
                where: and(
                    eq(investmentCashBalances.userId, ctx.userId!),
                    eq(investmentCashBalances.currency, currency)
                ),
            });

            if (!existingCash || parseFloat(existingCash.availableBalance) < totalAmount) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Insufficient investment cash balance. Available: ${existingCash?.availableBalance || '0'}, Required: ${totalAmount}`,
                });
            }

            

            // Update or create holding
            const existingHolding = await ctx.db.query.portfolioHoldings.findFirst({
                where: and(
                    eq(portfolioHoldings.userId, ctx.userId!),
                    eq(portfolioHoldings.stockId, stockId)
                ),
            });

            if (existingHolding) {
                // Update existing holding with new average cost basis
                const oldQuantity = parseFloat(existingHolding.quantity);
                const oldCostBasis = parseFloat(existingHolding.averageCostBasis);
                const newQuantity = oldQuantity + quantity;
                const newCostBasis = ((oldQuantity * oldCostBasis) + (quantity * pricePerShare)) / newQuantity;

                await ctx.db.update(portfolioHoldings)
                    .set({
                        quantity: newQuantity.toString(),
                        averageCostBasis: newCostBasis.toString(),
                        updatedAt: new Date(),
                    })
                    .where(eq(portfolioHoldings.id, existingHolding.id));
            } else {
                // Create new holding
                await ctx.db.insert(portfolioHoldings).values({
                    userId: ctx.userId!,
                    stockId,
                    quantity: quantity.toString(),
                    averageCostBasis: pricePerShare.toString(),
                });
            }

            // Update investment cash balance
            const newAvailableBalance = (parseFloat(existingCash.availableBalance) - totalAmount).toString();
            await ctx.db.update(investmentCashBalances)
                .set({
                    availableBalance: newAvailableBalance,
                    updatedAt: new Date(),
                })
                .where(eq(investmentCashBalances.id, existingCash.id));

            // Create transaction record with cash flow
            await ctx.db.insert(investmentTransactions).values({
                userId: ctx.userId!,
                stockId,
                type: 'buy',
                date,
                quantity: quantity.toString(),
                pricePerShare: pricePerShare.toString(),
                totalAmount: totalAmount.toString(),
                currency,
                notes,
                cashFlow: (-totalAmount).toString(),
                cashBalanceAfter: newAvailableBalance,
            });

            // Invalidate portfolio cache to reflect new purchase
            await analyticsService.invalidatePortfolioCache(ctx.userId!);

            return { success: true };
        }),

    // Sell stock
    sellStock: protectedProcedure
        .input(sellStockSchema)
        .mutation(async ({ ctx, input }) => {
            const { stockId, date, quantity, pricePerShare, currency, notes } = input;

            // Verify stock ownership and sufficient quantity
            const holding = await ctx.db.query.portfolioHoldings.findFirst({
                where: and(
                    eq(portfolioHoldings.userId, ctx.userId!),
                    eq(portfolioHoldings.stockId, stockId)
                ),
            });

            if (!holding) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'You do not own this stock',
                });
            }

            const currentQuantity = parseFloat(holding.quantity);
            if (currentQuantity < quantity) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Insufficient quantity to sell',
                });
            }

            const totalAmount = quantity * pricePerShare;

            // Calculate realized P/L using FIFO
            const realizedPL = await analyticsService.calculateRealizedPL(
                ctx.userId!,
                stockId,
                quantity,
                pricePerShare
            );

            // Get investment cash balance
            const existingCash = await ctx.db.query.investmentCashBalances.findFirst({
                where: and(
                    eq(investmentCashBalances.userId, ctx.userId!),
                    eq(investmentCashBalances.currency, currency)
                ),
            });

            // Create cash balance if it doesn't exist
            let cashBalance = existingCash;
            if (!existingCash) {
                const [newCash] = await ctx.db.insert(investmentCashBalances).values({
                    userId: ctx.userId!,
                    currency,
                    availableBalance: '0',
                    settledBalance: '0',
                    lastUpdated: new Date(),
                }).returning();
                cashBalance = newCash;
            }

            // Update cash balance with sale proceeds
            const newAvailableBalance = (parseFloat(cashBalance!.availableBalance) + totalAmount).toString();
            await ctx.db.update(investmentCashBalances)
                .set({
                    availableBalance: newAvailableBalance,
                    settledBalance: newAvailableBalance, // Also update settled balance
                    updatedAt: new Date(),
                })
                .where(eq(investmentCashBalances.id, cashBalance!.id));

            // Create transaction record with cash flow
            await ctx.db.insert(investmentTransactions).values({
                userId: ctx.userId!,
                stockId,
                type: 'sell',
                date,
                quantity: quantity.toString(),
                pricePerShare: pricePerShare.toString(),
                totalAmount: totalAmount.toString(),
                currency,
                notes,
                realizedPL: realizedPL.toString(),
                cashFlow: totalAmount.toString(),
                cashBalanceAfter: newAvailableBalance,
            });

            // Update holding
            const newQuantity = currentQuantity - quantity;

            if (newQuantity === 0) {
                // Delete holding if fully sold
                await ctx.db.delete(portfolioHoldings)
                    .where(eq(portfolioHoldings.id, holding.id));
            } else {
                // Update quantity
                await ctx.db.update(portfolioHoldings)
                    .set({
                        quantity: newQuantity.toString(),
                        updatedAt: new Date(),
                    })
                    .where(eq(portfolioHoldings.id, holding.id));
            }

            // Invalidate portfolio cache to reflect sale
            await analyticsService.invalidatePortfolioCache(ctx.userId!);

            return { success: true, realizedPL };
        }),

    // Get transaction history
    getTransactions: protectedProcedure
        .input(z.object({
            stockId: z.string().uuid().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const where = input.stockId
                ? and(
                    eq(investmentTransactions.userId, ctx.userId!),
                    eq(investmentTransactions.stockId, input.stockId)
                )
                : eq(investmentTransactions.userId, ctx.userId!);

            return await ctx.db.query.investmentTransactions.findMany({
                where,
                with: {
                    stock: true,
                },
                orderBy: desc(investmentTransactions.date),
            });
        }),

    // Get stock price history
    getStockPriceHistory: protectedProcedure
        .input(stockPriceRangeSchema)
        .query(async ({ input }) => {
            const { start, end } = priceService.getDateRange(input.range);
            return await priceService.getStockPrices(input.stockId, start, end);
        }),

    // Get user's stocks
    listStocks: protectedProcedure
        .query(async ({ ctx }) => {
            return await ctx.db.query.stocks.findMany({
                where: eq(stocks.userId, ctx.userId!),
                orderBy: desc(stocks.createdAt),
            });
        }),

    // Delete stock (if no holdings or transactions)
    deleteStock: protectedProcedure
        .input(z.object({ stockId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Check for holdings
            const holding = await ctx.db.query.portfolioHoldings.findFirst({
                where: and(
                    eq(portfolioHoldings.stockId, input.stockId),
                    eq(portfolioHoldings.userId, ctx.userId!)
                ),
            });

            if (holding) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Cannot delete stock with active holdings. Sell all shares first.',
                });
            }

            // Check for transactions
            const transaction = await ctx.db.query.investmentTransactions.findFirst({
                where: and(
                    eq(investmentTransactions.stockId, input.stockId),
                    eq(investmentTransactions.userId, ctx.userId!)
                ),
            });

            if (transaction) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Cannot delete stock with transaction history.',
                });
            }

            // Delete the stock
            await ctx.db.delete(stocks)
                .where(and(
                    eq(stocks.id, input.stockId),
                    eq(stocks.userId, ctx.userId!)
                ));

            return { success: true };
        }),

    // Delete ALL stocks for the user
    deleteAllStocks: protectedProcedure
        .mutation(async ({ ctx }) => {
            // Due to cascade delete on foreign keys, deleting stocks will remove:
            // - investment_transactions
            // - portfolio_holdings
            // - stock_prices
            await ctx.db.delete(stocks)
                .where(eq(stocks.userId, ctx.userId!));

            // Clear all cache
            await investingCache.clearAll();

            return { success: true };
        }),

    // Get current quote for a ticker (used before stock is added to portfolio)
    getQuote: protectedProcedure
        .input(z.object({ ticker: z.string() }))
        .query(async ({ input }) => {
            const quote = await twelveData.getQuote(input.ticker);
            return {
                price: quote.close,
                date: quote.date,
            };
        }),

    // Get price for a specific date (or closest available trading day)
    getPriceForDate: protectedProcedure
        .input(z.object({
            ticker: z.string(),
            date: z.string(), // YYYY-MM-DD format
        }))
        .query(async ({ input, ctx }) => {
            // Fetch a small range around the requested date to find closest trading day
            const targetDate = new Date(input.date);
            const startDate = new Date(targetDate);
            startDate.setDate(startDate.getDate() - 7); // Look back up to 7 days for weekends/holidays

            // Extend end date by 1 day to ensure we get the target date (API might be exclusive or timezone sensitive)
            const endDate = new Date(targetDate);
            endDate.setDate(endDate.getDate() + 1);

            const prices = await twelveData.getDailyPrices(
                input.ticker,
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0],
                10,
                ctx.userId
            );

            if (prices.length === 0) {
                return null;
            }

            // Find exact date or closest prior date
            // Filter out any prices from the future (relative to requested date)
            const validPrices = prices.filter(p => p.date <= input.date);

            if (validPrices.length === 0) {
                return null;
            }

            // Find exact date or closest prior date
            const exactMatch = validPrices.find(p => p.date === input.date);
            if (exactMatch) {
                return { price: exactMatch.close, date: exactMatch.date };
            }

            // Return the most recent price before the requested date
            const sortedPrices = validPrices.sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const closest = sortedPrices[0];
            return { price: closest.close, date: closest.date };
        }),

    // Update investment transaction
    updateTransaction: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            date: z.string(),
            quantity: z.number().positive(),
            pricePerShare: z.number().positive(),
            notes: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, date, quantity, pricePerShare, notes } = input;

            // Get transaction to verify ownership and get stockId
            const transaction = await ctx.db.query.investmentTransactions.findFirst({
                where: and(
                    eq(investmentTransactions.id, id),
                    eq(investmentTransactions.userId, ctx.userId!)
                ),
            });

            if (!transaction) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Transaction not found',
                });
            }

            const totalAmount = quantity * pricePerShare;

            // Update transaction
            await ctx.db.update(investmentTransactions)
                .set({
                    date,
                    quantity: quantity.toString(),
                    pricePerShare: pricePerShare.toString(),
                    totalAmount: totalAmount.toString(),
                    notes,
                })
                .where(eq(investmentTransactions.id, id));

            // Recalculate holding
            await recalculateHolding(ctx.db, ctx.userId!, transaction.stockId);

            // Invalidate cache
            await analyticsService.invalidatePortfolioCache(ctx.userId!);

            return { success: true };
        }),

    // Delete investment transaction
    deleteTransaction: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Get transaction to verify ownership and get stockId
            const transaction = await ctx.db.query.investmentTransactions.findFirst({
                where: and(
                    eq(investmentTransactions.id, input.id),
                    eq(investmentTransactions.userId, ctx.userId!)
                ),
            });

            if (!transaction) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Transaction not found',
                });
            }

            // Delete transaction
            await ctx.db.delete(investmentTransactions)
                .where(eq(investmentTransactions.id, input.id));

            // Recalculate holding
            await recalculateHolding(ctx.db, ctx.userId!, transaction.stockId);

            // Invalidate cache
            await analyticsService.invalidatePortfolioCache(ctx.userId!);

            return { success: true };
        }),

    // ========================================
    // Cache Management Endpoints
    // ========================================

    // Get cache statistics for monitoring
    getCacheStats: protectedProcedure
        .query(async () => {
            const stats = await investingCache.getStats();
            return { cache: stats };
        }),

    // Clear all investment cache (use sparingly)
    clearCache: protectedProcedure
        .mutation(async () => {
            await investingCache.clearAll();
            return { success: true, message: 'Investment cache cleared' };
        }),

    // Reset cache statistics
    resetCacheStats: protectedProcedure
        .mutation(async () => {
            await investingCache.resetStats();
            return { success: true, message: 'Cache statistics reset' };
        }),

    // Get investment cash balances
    getInvestmentCashBalance: protectedProcedure
        .query(async ({ ctx }) => {
            const cashBalances = await ctx.db.query.investmentCashBalances.findMany({
                where: eq(investmentCashBalances.userId, ctx.userId!),
            });

            return cashBalances;
        }),

    // Deposit cash to investment account
    depositToInvestment: protectedProcedure
        .input(z.object({
            amount: z.number().positive(),
            currency: z.string().length(3),
            notes: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { amount, currency, notes } = input;

            // Create or update investment cash balance
            const existingCash = await ctx.db.query.investmentCashBalances.findFirst({
                where: and(
                    eq(investmentCashBalances.userId, ctx.userId!),
                    eq(investmentCashBalances.currency, currency)
                ),
            });

            if (existingCash) {
                // Update existing balance
                const newAvailable = (parseFloat(existingCash.availableBalance) + amount).toString();
                const newSettled = (parseFloat(existingCash.settledBalance) + amount).toString();

                await ctx.db.update(investmentCashBalances)
                    .set({
                        availableBalance: newAvailable,
                        settledBalance: newSettled,
                        updatedAt: new Date(),
                    })
                    .where(eq(investmentCashBalances.id, existingCash.id));
            } else {
                // Create new cash balance
                await ctx.db.insert(investmentCashBalances).values({
                    userId: ctx.userId!,
                    currency,
                    availableBalance: amount.toString(),
                    settledBalance: amount.toString(),
                    lastUpdated: new Date(),
                });
            }

            // Invalidate portfolio cache
            await analyticsService.invalidatePortfolioCache(ctx.userId!);

            return { success: true };
        }),

    // Withdraw cash from investment account
    withdrawFromInvestment: protectedProcedure
        .input(z.object({
            amount: z.number().positive(),
            currency: z.string().length(3),
            notes: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { amount, currency, notes } = input;

            // Check available balance
            const existingCash = await ctx.db.query.investmentCashBalances.findFirst({
                where: and(
                    eq(investmentCashBalances.userId, ctx.userId!),
                    eq(investmentCashBalances.currency, currency)
                ),
            });

            if (!existingCash || parseFloat(existingCash.availableBalance) < amount) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Insufficient investment cash balance',
                });
            }

            // Update balance
            const newAvailable = (parseFloat(existingCash.availableBalance) - amount).toString();
            const newSettled = (parseFloat(existingCash.settledBalance) - amount).toString();

            await ctx.db.update(investmentCashBalances)
                .set({
                    availableBalance: newAvailable,
                    settledBalance: newSettled,
                    updatedAt: new Date(),
                })
                .where(eq(investmentCashBalances.id, existingCash.id));

            // Invalidate portfolio cache
            await analyticsService.invalidatePortfolioCache(ctx.userId!);

            return { success: true };
        }),
});

// Helper to recalculate holding quantity and average cost basis from transaction history
async function recalculateHolding(db: any, userId: string, stockId: string) {
    // Fetch all transactions for this stock ordered by date
    const txs = await db.query.investmentTransactions.findMany({
        where: and(
            eq(investmentTransactions.userId, userId),
            eq(investmentTransactions.stockId, stockId)
        ),
        orderBy: [investmentTransactions.date, investmentTransactions.createdAt],
    });

    let quantity = 0;
    let totalCost = 0;

    for (const tx of txs) {
        const txQty = parseFloat(tx.quantity);
        const txPrice = parseFloat(tx.pricePerShare);

        if (tx.type === 'buy') {
            totalCost += txQty * txPrice;
            quantity += txQty;
        } else if (tx.type === 'sell') {
            // For sell, we reduce quantity. Cost basis per share remains same, so we reduce totalCost proportionally.
            // FIFO/Average Cost assumption: When selling, we reduce the total cost by the average cost of the sold shares.
            const avgCost = quantity > 0 ? totalCost / quantity : 0;
            quantity -= txQty;
            totalCost -= txQty * avgCost;
        }
    }

    // Ensure no negative values due to floating point precision
    if (quantity < 0.000001) {
        quantity = 0;
        totalCost = 0;
    }

    const averageCostBasis = quantity > 0 ? totalCost / quantity : 0;

    // Upate or delete holding
    const existingHolding = await db.query.portfolioHoldings.findFirst({
        where: and(
            eq(portfolioHoldings.userId, userId),
            eq(portfolioHoldings.stockId, stockId)
        ),
    });

    if (quantity === 0) {
        if (existingHolding) {
            await db.delete(portfolioHoldings)
                .where(eq(portfolioHoldings.id, existingHolding.id));
        }
    } else {
        if (existingHolding) {
            await db.update(portfolioHoldings)
                .set({
                    quantity: quantity.toString(),
                    averageCostBasis: averageCostBasis.toString(),
                    updatedAt: new Date(),
                })
                .where(eq(portfolioHoldings.id, existingHolding.id));
        } else {
            await db.insert(portfolioHoldings).values({
                userId,
                stockId,
                quantity: quantity.toString(),
                averageCostBasis: averageCostBasis.toString(),
            });
        }
    }
}
