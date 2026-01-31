import { router, protectedProcedure } from '../lib/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';

const ISO_DATE_REGEXP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid table names for import
const VALID_TABLES = [
    'banks', 'accounts', 'currencyBalances', 'categories', 'transactions',
    'debts', 'debtPayments', 'credits', 'mortgages', 'deposits',
    'stocks', 'stockPrices', 'portfolioHoldings', 'investmentTransactions',
    'subscriptions', 'subscriptionPayments', 'splitParticipants', 'transactionSplits', 'splitPayments'
] as const;

// Schema for validating imported data structure
const importDataSchema = z.object({
    timestamp: z.string().datetime().optional(),
    version: z.number().optional(),
    data: z.record(z.array(z.record(z.any())))
        .refine(
            (data) => Object.keys(data).every(key => VALID_TABLES.includes(key as any)),
            { message: 'Invalid table name in import data' }
        )
});

function parseDates(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        if (ISO_DATE_REGEXP.test(obj)) {
            const date = new Date(obj);
            if (!isNaN(date.getTime())) return date;
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(parseDates);
    }
    if (typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            newObj[key] = parseDates(obj[key]);
        }
        return newObj;
    }
    return obj;
}

function remapIds(data: any): any {
    const idMap: Record<string, string> = {};

    // 1. Collect all IDs and generate new ones
    for (const table in data) {
        if (Array.isArray(data[table])) {
            data[table].forEach((item: any) => {
                if (item.id && UUID_REGEX.test(item.id)) {
                    idMap[item.id] = crypto.randomUUID();
                }
            });
        }
    }

    // 2. Map old IDs to new IDs in all fields
    const remapFields = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (obj instanceof Date) return obj; // CRITICAL: Preserve Date objects
        if (typeof obj === 'string') {
            return idMap[obj] || obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(remapFields);
        }
        if (typeof obj === 'object') {
            // Preserve non-plain objects if any (though parseDates mostly creates Dates)
            if (obj.constructor !== Object && obj.constructor !== undefined) return obj;

            const newObj: any = {};
            for (const key in obj) {
                if (key === 'userId') {
                    newObj[key] = obj[key];
                } else {
                    newObj[key] = remapFields(obj[key]);
                }
            }
            return newObj;
        }
        return obj;
    };

    return remapFields(data);
}

export const dataRouter = router({
    exportData: protectedProcedure.query(async ({ ctx }) => {
        // ... (existing code remains same)
        const banks = await ctx.db.query.banks.findMany({ where: eq(schema.banks.userId, ctx.userId!) });
        const bankIds = banks.map(b => b.id);

        const accounts = bankIds.length ? await ctx.db.query.accounts.findMany({
            where: inArray(schema.accounts.bankId, bankIds)
        }) : [];
        const accountIds = accounts.map(a => a.id);

        const balances = accountIds.length ? await ctx.db.query.currencyBalances.findMany({
            where: inArray(schema.currencyBalances.accountId, accountIds)
        }) : [];
        const balanceIds = balances.map(b => b.id);

        const transactions = balanceIds.length ? await ctx.db.query.transactions.findMany({
            where: inArray(schema.transactions.currencyBalanceId, balanceIds)
        }) : [];

        const categories = await ctx.db.query.categories.findMany({ where: eq(schema.categories.userId, ctx.userId!) });

        const debts = await ctx.db.query.debts.findMany({ where: eq(schema.debts.userId, ctx.userId!) });
        const debtIds = debts.map(d => d.id);
        const debtPayments = debtIds.length ? await ctx.db.query.debtPayments.findMany({
            where: inArray(schema.debtPayments.debtId, debtIds)
        }) : [];

        const credits = accountIds.length ? await ctx.db.query.credits.findMany({ where: inArray(schema.credits.accountId, accountIds) }) : [];
        const mortgages = accountIds.length ? await ctx.db.query.mortgages.findMany({ where: inArray(schema.mortgages.accountId, accountIds) }) : [];
        const deposits = accountIds.length ? await ctx.db.query.deposits.findMany({ where: inArray(schema.deposits.accountId, accountIds) }) : [];

        const stocks = await ctx.db.query.stocks.findMany({ where: eq(schema.stocks.userId, ctx.userId!) });
        // Manual stock prices
        const manualStockIds = stocks.filter(s => s.isManual).map(s => s.id);
        const stockPrices = manualStockIds.length ? await ctx.db.query.stockPrices.findMany({
            where: inArray(schema.stockPrices.stockId, manualStockIds)
        }) : [];

        const holdings = await ctx.db.query.portfolioHoldings.findMany({ where: eq(schema.portfolioHoldings.userId, ctx.userId!) });
        const invTransactions = await ctx.db.query.investmentTransactions.findMany({ where: eq(schema.investmentTransactions.userId, ctx.userId!) });

        const splitParticipants = await ctx.db.query.splitParticipants.findMany({ where: eq(schema.splitParticipants.userId, ctx.userId!) });
        const participantIds = splitParticipants.map(p => p.id);
        const transactionSplits = participantIds.length ? await ctx.db.query.transactionSplits.findMany({
            where: inArray(schema.transactionSplits.participantId, participantIds)
        }) : [];
        const splitIds = transactionSplits.map(s => s.id);
        const splitPayments = splitIds.length ? await ctx.db.query.splitPayments.findMany({
            where: inArray(schema.splitPayments.splitId, splitIds)
        }) : [];

        return {
            timestamp: new Date().toISOString(),
            version: 1,
            data: {
                banks,
                accounts,
                currencyBalances: balances,
                categories,
                transactions,
                debts,
                debtPayments,
                credits,
                mortgages,
                deposits,
                stocks,
                stockPrices,
                portfolioHoldings: holdings,
                investmentTransactions: invTransactions,
                subscriptions: await ctx.db.query.subscriptions.findMany({ where: eq(schema.subscriptions.userId, ctx.userId!) }),
                subscriptionPayments: (await (async () => {
                    const subs = await ctx.db.query.subscriptions.findMany({ where: eq(schema.subscriptions.userId, ctx.userId!) });
                    const ids = subs.map(s => s.id);
                    return ids.length ? await ctx.db.query.subscriptionPayments.findMany({ where: inArray(schema.subscriptionPayments.subscriptionId, ids) }) : [];
                })()),
                splitParticipants,
                transactionSplits,
                splitPayments,
            }
        };
    }),

    importData: protectedProcedure
        .input(importDataSchema)
        .mutation(async ({ ctx, input }) => {
            let data = parseDates(input.data);
            data = remapIds(data);

            if (!data || typeof data !== 'object') {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invalid data format'
                });
            }

            await ctx.db.transaction(async (tx) => {
                // 1. Delete all existing user data
                // Delete banks (cascades accounts -> balances -> transactions, credits, mortgages, deposits)
                await tx.delete(schema.banks).where(eq(schema.banks.userId, ctx.userId!));

                // Delete user categories
                await tx.delete(schema.categories).where(eq(schema.categories.userId, ctx.userId!));

                // Delete debts (cascades payments)
                await tx.delete(schema.debts).where(eq(schema.debts.userId, ctx.userId!));

                // Delete stocks (cascades prices, holdings, invTx)
                await tx.delete(schema.stocks).where(eq(schema.stocks.userId, ctx.userId!));

                // Delete subscriptions (cascades payments)
                await tx.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, ctx.userId!));

                // Delete split bills (cascades to payments)
                await tx.delete(schema.splitParticipants).where(eq(schema.splitParticipants.userId, ctx.userId!));

                // 2. Insert new data
                const withUser = (items: any[]) => items.map(i => ({ ...i, userId: ctx.userId! }));

                // Order matters due to foreign keys
                if (data.categories?.length) await tx.insert(schema.categories).values(withUser(data.categories));
                if (data.banks?.length) await tx.insert(schema.banks).values(withUser(data.banks));
                if (data.accounts?.length) await tx.insert(schema.accounts).values(data.accounts);
                if (data.currencyBalances?.length) await tx.insert(schema.currencyBalances).values(data.currencyBalances);

                // Credits, Mortgages, Deposits depend on accounts
                if (data.credits?.length) await tx.insert(schema.credits).values(data.credits);
                if (data.mortgages?.length) await tx.insert(schema.mortgages).values(data.mortgages);
                if (data.deposits?.length) await tx.insert(schema.deposits).values(data.deposits);

                // Debts can depend on currencyBalances
                if (data.debts?.length) await tx.insert(schema.debts).values(withUser(data.debts));
                if (data.debtPayments?.length) await tx.insert(schema.debtPayments).values(data.debtPayments);

                // Transactions depend on currencyBalances, categories, debtPayments
                if (data.transactions?.length) await tx.insert(schema.transactions).values(data.transactions);

                // Investing
                if (data.stocks?.length) await tx.insert(schema.stocks).values(withUser(data.stocks));
                if (data.stockPrices?.length) await tx.insert(schema.stockPrices).values(data.stockPrices);
                if (data.portfolioHoldings?.length) await tx.insert(schema.portfolioHoldings).values(withUser(data.portfolioHoldings));
                if (data.investmentTransactions?.length) await tx.insert(schema.investmentTransactions).values(withUser(data.investmentTransactions));

                // Subscriptions
                if (data.subscriptions?.length) await tx.insert(schema.subscriptions).values(withUser(data.subscriptions));
                if (data.subscriptionPayments?.length) await tx.insert(schema.subscriptionPayments).values(data.subscriptionPayments);

                // Split Bills
                if (data.splitParticipants?.length) await tx.insert(schema.splitParticipants).values(withUser(data.splitParticipants));
                if (data.transactionSplits?.length) await tx.insert(schema.transactionSplits).values(data.transactionSplits);
                if (data.splitPayments?.length) await tx.insert(schema.splitPayments).values(data.splitPayments);
            });

            return { success: true };
        })
});

