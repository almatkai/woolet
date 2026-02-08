import { z } from 'zod';
import { eq, inArray, or } from 'drizzle-orm';
import { router, protectedProcedure } from '../lib/trpc';
import { investingCache } from '../lib/investing-cache';
import { redis } from '../lib/redis';
import {
    users,
    banks,
    accounts,
    transactions,
    categories,
    debts,
    debtPayments,
    credits,
    mortgages,
    deposits,
    creditPayments,
    dashboardLayouts,
    currencyBalances,
    investmentTransactions,
    portfolioHoldings,
    stocks,
    userSettings,
    subscriptions,
    subscriptionPayments,
    splitParticipants,
    transactionSplits,
    splitPayments,
    admins,
    stockPrices,
} from '../db/schema';
import * as schema from '../db/schema';
import { TRPCError } from '@trpc/server';
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

// Test mode limits
const TEST_MODE_LIMITS = {
    transactions: 35,
    mortgages: 1,
    deposits: 2,
    debts: 4,
    accounts: 2,
};

// Production limits (effectively unlimited)
const PRODUCTION_LIMITS = {
    transactions: 999999,
    mortgages: 999999,
    deposits: 999999,
    debts: 999999,
    accounts: 999999,
};

// User preferences schema
const userPreferencesSchema = z.object({
    weekStartsOn: z.number().min(0).max(6).optional(), // 0 = Sunday, 1 = Monday, etc.
    spendingWidget: z.object({
        categoryIds: z.array(z.string().uuid()).optional(),
    }).optional(),
    recentTransactionsWidget: z.object({
        excludedCategories: z.array(z.string().uuid()).optional(),
        period: z.string().optional(),
    }).optional(),
}).optional();

export const userRouter = router({
    me: protectedProcedure.query(async ({ ctx }) => {
        const user = await ctx.db.query.users.findFirst({
            where: eq(users.id, ctx.userId),
        });

        return user;
    }),

    isAdmin: protectedProcedure.query(async ({ ctx }) => {
        const admin = await ctx.db.query.admins.findFirst({
            where: eq(admins.id, ctx.userId!),
        });
        return !!admin;
    }),

    getLimits: protectedProcedure.query(async ({ ctx }) => {
        const user = await ctx.db.query.users.findFirst({
            where: eq(users.id, ctx.userId),
        });

        if (user?.testMode) {
            return { testMode: true, limits: TEST_MODE_LIMITS };
        }
        return { testMode: false, limits: PRODUCTION_LIMITS };
    }),

    create: protectedProcedure
        .input(z.object({
            email: z.string().email(),
            name: z.string().optional(),
            defaultCurrency: z.string().length(3).default('USD'),
        }))
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.query.users.findFirst({
                where: eq(users.id, ctx.userId),
            });

            if (existing) {
                return existing;
            }

            const [user] = await ctx.db.insert(users).values({
                id: ctx.userId,
                email: input.email,
                name: input.name,
                defaultCurrency: input.defaultCurrency.toUpperCase(),
            }).returning();

            return user;
        }),

    update: protectedProcedure
        .input(z.object({
            name: z.string().optional(),
            defaultCurrency: z.string().length(3).optional(),
            testMode: z.boolean().optional(),
            preferences: userPreferencesSchema,
        }))
        .mutation(async ({ ctx, input }) => {
            const updateData: Record<string, unknown> = { updatedAt: new Date() };

            if (input.name !== undefined) {
                updateData.name = input.name;
            }
            if (input.defaultCurrency !== undefined) {
                updateData.defaultCurrency = input.defaultCurrency.toUpperCase();
            }
            if (input.testMode !== undefined) {
                updateData.testMode = input.testMode;
            }
            if (input.preferences !== undefined) {
                updateData.preferences = input.preferences;
            }

            const [updated] = await ctx.db.update(users)
                .set(updateData)
                .where(eq(users.id, ctx.userId))
                .returning();

            return updated;
        }),

    deleteAllData: protectedProcedure
        .mutation(async ({ ctx }) => {
            const userBankIds = ctx.db
                .select({ id: banks.id })
                .from(banks)
                .where(eq(banks.userId, ctx.userId));

            const userAccountIds = ctx.db
                .select({ id: accounts.id })
                .from(accounts)
                .where(inArray(accounts.bankId, userBankIds));

            const userCurrencyBalanceIds = ctx.db
                .select({ id: currencyBalances.id })
                .from(currencyBalances)
                .where(inArray(currencyBalances.accountId, userAccountIds));

            const userCreditIds = ctx.db
                .select({ id: credits.id })
                .from(credits)
                .where(inArray(credits.accountId, userAccountIds));

            const userDebtIds = ctx.db
                .select({ id: debts.id })
                .from(debts)
                .where(eq(debts.userId, ctx.userId));

            // Delete all user-related data in correct order (respecting foreign key constraints)
            // Start with child tables first, then parent tables

            // Delete transactions (references currency balances)
            await ctx.db.delete(transactions)
                .where(or(
                    inArray(transactions.currencyBalanceId, userCurrencyBalanceIds),
                    inArray(transactions.toCurrencyBalanceId, userCurrencyBalanceIds)
                ));

            // Delete credit payments (references credits)
            await ctx.db.delete(creditPayments)
                .where(inArray(creditPayments.creditId, userCreditIds));

            // Delete debt payments (references debts)
            await ctx.db.delete(debtPayments)
                .where(inArray(debtPayments.debtId, userDebtIds));

            // Delete currency balances (references accounts)
            await ctx.db.delete(currencyBalances)
                .where(inArray(currencyBalances.accountId, userAccountIds));

            // Delete accounts (references banks)
            await ctx.db.delete(accounts)
                .where(inArray(accounts.bankId, userBankIds));

            // Delete banks
            await ctx.db.delete(banks)
                .where(eq(banks.userId, ctx.userId));

            // Delete financial products
            await ctx.db.delete(credits)
                .where(inArray(credits.accountId, userAccountIds));

            await ctx.db.delete(mortgages)
                .where(inArray(mortgages.accountId, userAccountIds));

            await ctx.db.delete(deposits)
                .where(inArray(deposits.accountId, userAccountIds));

            await ctx.db.delete(debts)
                .where(eq(debts.userId, ctx.userId));

            // Delete categories
            await ctx.db.delete(categories)
                .where(eq(categories.userId, ctx.userId));

            // Delete dashboard layout
            await ctx.db.delete(dashboardLayouts)
                .where(eq(dashboardLayouts.userId, ctx.userId));

            // Delete portfolio holdings
            await ctx.db.delete(portfolioHoldings)
                .where(eq(portfolioHoldings.userId, ctx.userId));

            // Delete investment transactions
            await ctx.db.delete(investmentTransactions)
                .where(eq(investmentTransactions.userId, ctx.userId));

            // Delete stocks (and cascading stock prices)
            await ctx.db.delete(stocks)
                .where(eq(stocks.userId, ctx.userId));

            // Clear investing cache for this user
            await investingCache.invalidatePattern(`portfolio:${ctx.userId}`);

            // Reset user to default state (keep the user record but reset test mode)
            const [resetUser] = await ctx.db.update(users)
                .set({
                    testMode: false,
                    updatedAt: new Date()
                })
                .where(eq(users.id, ctx.userId))
                .returning();

            return {
                success: true,
                message: 'All user data has been deleted successfully',
                user: resetUser
            };
        }),

    deleteAccount: protectedProcedure
        .mutation(async ({ ctx }) => {
            // 1. Manually delete entities that might not have cascade delete
            // (Though we should ideally update the schema, we'll be safe here)

            // Delete user settings
            await ctx.db.delete(userSettings).where(eq(userSettings.userId, ctx.userId));

            // Delete subscriptions (assuming they don't cascade)
            await ctx.db.delete(subscriptions).where(eq(subscriptions.userId, ctx.userId));

            // 2. Delete the main user record. 
            // Most other tables (banks, stocks, ai_usage, categories, dashboard_layouts)
            // have onDelete: 'cascade' on their userId foreign key.
            await ctx.db.delete(users).where(eq(users.id, ctx.userId));

            // Clear any user-specific cache
            await investingCache.invalidatePattern(`*:${ctx.userId}`);
            await redis.del(`ratelimit:user:${ctx.userId}`);

            return {
                success: true,
                message: 'Your account and all associated data have been permanently deleted.'
            };
        }),

    exportAllData: protectedProcedure.query(async ({ ctx }) => {
        const userBanks = await ctx.db.query.banks.findMany({ where: eq(schema.banks.userId, ctx.userId!) });
        const bankIds = userBanks.map(b => b.id);

        const userAccounts = bankIds.length ? await ctx.db.query.accounts.findMany({
            where: inArray(schema.accounts.bankId, bankIds)
        }) : [];
        const accountIds = userAccounts.map(a => a.id);

        const balances = accountIds.length ? await ctx.db.query.currencyBalances.findMany({
            where: inArray(schema.currencyBalances.accountId, accountIds)
        }) : [];
        const balanceIds = balances.map(b => b.id);

        const userTransactions = balanceIds.length ? await ctx.db.query.transactions.findMany({
            where: inArray(schema.transactions.currencyBalanceId, balanceIds)
        }) : [];

        const userCategories = await ctx.db.query.categories.findMany({ where: eq(schema.categories.userId, ctx.userId!) });

        const userDebts = await ctx.db.query.debts.findMany({ where: eq(schema.debts.userId, ctx.userId!) });
        const debtIds = userDebts.map(d => d.id);
        const userDebtPayments = debtIds.length ? await ctx.db.query.debtPayments.findMany({
            where: inArray(schema.debtPayments.debtId, debtIds)
        }) : [];

        const userCredits = accountIds.length ? await ctx.db.query.credits.findMany({ where: inArray(schema.credits.accountId, accountIds) }) : [];
        const userMortgages = accountIds.length ? await ctx.db.query.mortgages.findMany({ where: inArray(schema.mortgages.accountId, accountIds) }) : [];
        const userDeposits = accountIds.length ? await ctx.db.query.deposits.findMany({ where: inArray(schema.deposits.accountId, accountIds) }) : [];

        const userStocks = await ctx.db.query.stocks.findMany({ where: eq(schema.stocks.userId, ctx.userId!) });
        const manualStockIds = userStocks.filter(s => s.isManual).map(s => s.id);
        const userStockPrices = manualStockIds.length ? await ctx.db.query.stockPrices.findMany({
            where: inArray(schema.stockPrices.stockId, manualStockIds)
        }) : [];

        const holdings = await ctx.db.query.portfolioHoldings.findMany({ where: eq(schema.portfolioHoldings.userId, ctx.userId!) });
        const invTransactions = await ctx.db.query.investmentTransactions.findMany({ where: eq(schema.investmentTransactions.userId, ctx.userId!) });

        const userSplitParticipants = await ctx.db.query.splitParticipants.findMany({ where: eq(schema.splitParticipants.userId, ctx.userId!) });
        const participantIds = userSplitParticipants.map(p => p.id);
        const userTransactionSplits = participantIds.length ? await ctx.db.query.transactionSplits.findMany({
            where: inArray(schema.transactionSplits.participantId, participantIds)
        }) : [];
        const splitIds = userTransactionSplits.map(s => s.id);
        const userSplitPayments = splitIds.length ? await ctx.db.query.splitPayments.findMany({
            where: inArray(schema.splitPayments.splitId, splitIds)
        }) : [];

        return {
            timestamp: new Date().toISOString(),
            version: 1,
            data: {
                banks: userBanks,
                accounts: userAccounts,
                currencyBalances: balances,
                categories: userCategories,
                transactions: userTransactions,
                debts: userDebts,
                debtPayments: userDebtPayments,
                credits: userCredits,
                mortgages: userMortgages,
                deposits: userDeposits,
                stocks: userStocks,
                stockPrices: userStockPrices,
                portfolioHoldings: holdings,
                investmentTransactions: invTransactions,
                subscriptions: await ctx.db.query.subscriptions.findMany({ where: eq(schema.subscriptions.userId, ctx.userId!) }),
                subscriptionPayments: (await (async () => {
                    const subs = await ctx.db.query.subscriptions.findMany({ where: eq(schema.subscriptions.userId, ctx.userId!) });
                    const ids = subs.map(s => s.id);
                    return ids.length ? await ctx.db.query.subscriptionPayments.findMany({ where: inArray(schema.subscriptionPayments.subscriptionId, ids) }) : [];
                })()),
                splitParticipants: userSplitParticipants,
                transactionSplits: userTransactionSplits,
                splitPayments: userSplitPayments,
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
                // 1. Delete all existing user data using robust deletion logic
                const userBankIds = tx
                    .select({ id: schema.banks.id })
                    .from(schema.banks)
                    .where(eq(schema.banks.userId, ctx.userId!));

                const userAccountIds = tx
                    .select({ id: schema.accounts.id })
                    .from(schema.accounts)
                    .where(inArray(schema.accounts.bankId, userBankIds));

                const userCurrencyBalanceIds = tx
                    .select({ id: schema.currencyBalances.id })
                    .from(schema.currencyBalances)
                    .where(inArray(schema.currencyBalances.accountId, userAccountIds));

                const userCreditIds = tx
                    .select({ id: schema.credits.id })
                    .from(schema.credits)
                    .where(inArray(schema.credits.accountId, userAccountIds));

                const userDebtIds = tx
                    .select({ id: schema.debts.id })
                    .from(schema.debts)
                    .where(eq(schema.debts.userId, ctx.userId!));

                const userSubIds = tx
                    .select({ id: schema.subscriptions.id })
                    .from(schema.subscriptions)
                    .where(eq(schema.subscriptions.userId, ctx.userId!));

                const participantIds = tx
                    .select({ id: schema.splitParticipants.id })
                    .from(schema.splitParticipants)
                    .where(eq(schema.splitParticipants.userId, ctx.userId!));

                const splitIds = tx
                    .select({ id: schema.transactionSplits.id })
                    .from(schema.transactionSplits)
                    .where(inArray(schema.transactionSplits.participantId, participantIds));

                // Delete child tables first
                await tx.delete(schema.transactions).where(or(
                    inArray(schema.transactions.currencyBalanceId, userCurrencyBalanceIds),
                    inArray(schema.transactions.toCurrencyBalanceId, userCurrencyBalanceIds)
                ));

                await tx.delete(schema.creditPayments).where(inArray(schema.creditPayments.creditId, userCreditIds));
                await tx.delete(schema.debtPayments).where(inArray(schema.debtPayments.debtId, userDebtIds));
                await tx.delete(schema.subscriptionPayments).where(inArray(schema.subscriptionPayments.subscriptionId, userSubIds));
                await tx.delete(schema.splitPayments).where(inArray(schema.splitPayments.splitId, splitIds));
                await tx.delete(schema.transactionSplits).where(inArray(schema.transactionSplits.participantId, participantIds));

                // Delete intermediate tables
                await tx.delete(schema.currencyBalances).where(inArray(schema.currencyBalances.accountId, userAccountIds));
                await tx.delete(schema.accounts).where(inArray(schema.accounts.bankId, userBankIds));

                await tx.delete(schema.credits).where(inArray(schema.credits.accountId, userAccountIds));
                await tx.delete(schema.mortgages).where(inArray(schema.mortgages.accountId, userAccountIds));
                await tx.delete(schema.deposits).where(inArray(schema.deposits.accountId, userAccountIds));

                // Delete parent tables
                await tx.delete(schema.banks).where(eq(schema.banks.userId, ctx.userId!));
                await tx.delete(schema.categories).where(eq(schema.categories.userId, ctx.userId!));
                await tx.delete(schema.debts).where(eq(schema.debts.userId, ctx.userId!));
                await tx.delete(schema.stocks).where(eq(schema.stocks.userId, ctx.userId!));
                await tx.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, ctx.userId!));
                await tx.delete(schema.splitParticipants).where(eq(schema.splitParticipants.userId, ctx.userId!));
                await tx.delete(schema.portfolioHoldings).where(eq(schema.portfolioHoldings.userId, ctx.userId!));
                await tx.delete(schema.investmentTransactions).where(eq(schema.investmentTransactions.userId, ctx.userId!));
                await tx.delete(schema.dashboardLayouts).where(eq(schema.dashboardLayouts.userId, ctx.userId!));
                await tx.delete(schema.userSettings).where(eq(schema.userSettings.userId, ctx.userId!));

                // 2. Insert new data
                const withUser = (items: any[]) => items.map(i => ({ ...i, userId: ctx.userId! }));

                if (data.categories?.length) await tx.insert(schema.categories).values(withUser(data.categories));
                if (data.banks?.length) await tx.insert(schema.banks).values(withUser(data.banks));
                if (data.accounts?.length) await tx.insert(schema.accounts).values(data.accounts);
                if (data.currencyBalances?.length) await tx.insert(schema.currencyBalances).values(data.currencyBalances);

                if (data.credits?.length) await tx.insert(schema.credits).values(data.credits);
                if (data.mortgages?.length) await tx.insert(schema.mortgages).values(data.mortgages);
                if (data.deposits?.length) await tx.insert(schema.deposits).values(data.deposits);

                if (data.debts?.length) await tx.insert(schema.debts).values(withUser(data.debts));
                if (data.debtPayments?.length) await tx.insert(schema.debtPayments).values(data.debtPayments);

                if (data.transactions?.length) await tx.insert(schema.transactions).values(data.transactions);

                if (data.stocks?.length) await tx.insert(schema.stocks).values(withUser(data.stocks));
                if (data.stockPrices?.length) await tx.insert(schema.stockPrices).values(data.stockPrices);
                if (data.portfolioHoldings?.length) await tx.insert(schema.portfolioHoldings).values(withUser(data.portfolioHoldings));
                if (data.investmentTransactions?.length) await tx.insert(schema.investmentTransactions).values(withUser(data.investmentTransactions));

                if (data.subscriptions?.length) await tx.insert(schema.subscriptions).values(withUser(data.subscriptions));
                if (data.subscriptionPayments?.length) await tx.insert(schema.subscriptionPayments).values(data.subscriptionPayments);

                if (data.splitParticipants?.length) await tx.insert(schema.splitParticipants).values(withUser(data.splitParticipants));
                if (data.transactionSplits?.length) await tx.insert(schema.transactionSplits).values(data.transactionSplits);
                if (data.splitPayments?.length) await tx.insert(schema.splitPayments).values(data.splitPayments);
            });

            return { success: true };
        }),
});
