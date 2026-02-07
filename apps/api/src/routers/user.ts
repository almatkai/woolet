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
    admins,
} from '../db/schema';

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
});
