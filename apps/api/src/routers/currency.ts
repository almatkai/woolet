import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../lib/trpc';
import { currencies, fxRates } from '../db/schema';
import { currencyExchangeService } from '../services/currency-exchange-service';
import { db } from '../db';

export const currencyRouter = router({
    list: publicProcedure
        .query(async ({ ctx }) => {
            return await ctx.db.select().from(currencies);
        }),
    
    // Get current exchange rates for a base currency
    getExchangeRates: protectedProcedure
        .input(z.object({
            baseCurrency: z.string().default('USD'),
        }))
        .query(async ({ input }) => {
            return await currencyExchangeService.getExchangeRates(input.baseCurrency);
        }),
    
    // Get exchange rate history
    getRateHistory: protectedProcedure
        .input(z.object({
            fromCurrency: z.string(),
            toCurrency: z.string(),
            days: z.number().default(30),
        }))
        .query(async ({ input }) => {
            return await currencyExchangeService.getRateHistory(
                input.fromCurrency,
                input.toCurrency,
                input.days
            );
        }),
    
    // Convert amount between currencies
    convert: protectedProcedure
        .input(z.object({
            amount: z.number(),
            fromCurrency: z.string(),
            toCurrency: z.string(),
        }))
        .query(async ({ input }) => {
            return await currencyExchangeService.convert(
                input.amount,
                input.fromCurrency,
                input.toCurrency
            );
        }),
    
    // Get list of major currencies
    getMajorCurrencies: protectedProcedure
        .query(() => {
            return currencyExchangeService.getMajorCurrencies();
        }),
    
    // Add manual exchange rate (for unsupported currencies like KZT)
    addManualRate: protectedProcedure
        .input(z.object({
            fromCurrency: z.string(),
            toCurrency: z.string(),
            rate: z.number(),
            date: z.string().optional(), // YYYY-MM-DD format
        }))
        .mutation(async ({ input }) => {
            const today = input.date || new Date().toISOString().split('T')[0];
            
            const [inserted] = await db
                .insert(fxRates)
                .values({
                    date: today,
                    fromCurrency: input.fromCurrency,
                    toCurrency: input.toCurrency,
                    rate: input.rate.toString(),
                })
                .onConflictDoNothing()
                .returning();
            
            return inserted;
        }),
});
