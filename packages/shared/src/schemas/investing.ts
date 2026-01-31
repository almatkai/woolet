import { z } from 'zod';

// Stock schemas
export const stockSchema = z.object({
    ticker: z.string().min(1).max(10),
    name: z.string().min(1),
    currency: z.string().length(3),
    exchange: z.string().optional(),
    isManual: z.boolean().optional(),
});

export const addStockSchema = stockSchema;

export const updateStockPriceSchema = z.object({
    stockId: z.string().uuid(),
    price: z.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Investment transaction schemas
export const buyStockSchema = z.object({
    stockId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.number().positive(),
    pricePerShare: z.number().positive(),
    currency: z.string().length(3),
    notes: z.string().optional(),
});

export const sellStockSchema = z.object({
    stockId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.number().positive(),
    pricePerShare: z.number().positive(),
    currency: z.string().length(3),
    notes: z.string().optional(),
});

// Stock search
export const stockSearchSchema = z.object({
    query: z.string().min(1),
});

// Portfolio queries
export const portfolioRangeSchema = z.object({
    range: z.enum(['1D', '1W', '1M', '3M', '1Y', '5Y', 'MAX']),
});

export const stockPriceRangeSchema = z.object({
    stockId: z.string().uuid(),
    range: z.enum(['1D', '1W', '1M', '3M', '1Y', '5Y', 'MAX']),
});

export const benchmarkComparisonSchema = z.object({
    benchmarkId: z.string().uuid(),
    range: z.enum(['1M', '3M', '1Y', '5Y', 'MAX']),
});
