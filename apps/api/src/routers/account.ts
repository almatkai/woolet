import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { accounts, banks, currencyBalances, transactions, categories } from '../db/schema';
import { checkEntityLimit } from '../lib/limits';

export const accountRouter = router({
    list: protectedProcedure
        .input(z.object({ bankId: z.string().uuid().optional() }))
        .query(async ({ ctx, input }) => {
            // If bankId provided, verify ownership first or just join
            // Simpler to query accounts where bank.userId = ctx.user

            // For now, let's just return all accounts for user's banks
            // This requires a join or a whereExists subquery

            // Actually, querying via banks relation is cleaner
            const userBanks = await ctx.db.query.banks.findMany({
                where: and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ),
                with: {
                    accounts: {
                        where: input.bankId ? eq(accounts.bankId, input.bankId) : undefined,
                        with: {
                            currencyBalances: true
                        }
                    }
                }
            });

            return userBanks.flatMap(b => b.accounts.map(acc => ({
                ...acc,
                bank: {
                    id: b.id,
                    name: b.name,
                    icon: b.icon,
                    color: b.color
                }
            })));
        }),

    create: protectedProcedure
        .input(z.object({
            bankId: z.string().uuid(),
            name: z.string().min(1),
            type: z.enum(['checking', 'savings', 'card', 'crypto', 'investment', 'cash']),
            icon: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Check test mode limits
            await checkEntityLimit(ctx.db, ctx.userId!, 'accounts');

            // Verify bank ownership
            const bank = await ctx.db.query.banks.findFirst({
                where: and(eq(banks.id, input.bankId), eq(banks.userId, ctx.userId!))
            });

            if (!bank) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Bank not found' });
            }

            const [account] = await ctx.db.insert(accounts).values({
                bankId: input.bankId,
                name: input.name,
                type: input.type,
                icon: input.icon,
            }).returning();

            return account;
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().optional(),
            icon: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership via bank relationship
            const account = await ctx.db.query.accounts.findFirst({
                where: eq(accounts.id, input.id),
                with: { bank: true }
            });

            if (!account || account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found' });
            }

            await ctx.db.update(accounts)
                .set({
                    name: input.name,
                    icon: input.icon,
                    updatedAt: new Date(),
                })
                .where(eq(accounts.id, input.id));

            return { success: true };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership via bank relationship
            const account = await ctx.db.query.accounts.findFirst({
                where: eq(accounts.id, input.id),
                with: { bank: true }
            });

            if (!account || account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found' });
            }

            await ctx.db.delete(accounts).where(eq(accounts.id, input.id));
            return { success: true };
        }),

    // Currency Balance Management
    addCurrency: protectedProcedure
        .input(z.object({
            accountId: z.string().uuid(),
            currencyCode: z.string().length(3),
            initialBalance: z.number().default(0),
        }))
        .mutation(async ({ ctx, input }) => {
            const [balance] = await ctx.db.insert(currencyBalances).values({
                accountId: input.accountId,
                currencyCode: input.currencyCode,
                balance: input.initialBalance.toString(),
            }).returning();
            return balance;
        }),

    getTotalBalance: protectedProcedure
        .query(async ({ ctx }) => {
            // Join everything to sum up balances by currency
            // This is heavy to do in JS but fine for now
            const hierarchy = await ctx.db.query.banks.findMany({
                where: and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ),
                with: {
                    accounts: {
                        with: {
                            currencyBalances: true
                        }
                    }
                }
            });

            const balances: Record<string, number> = {};
            let accountCount = 0;

            hierarchy.forEach(bank => {
                bank.accounts.forEach(acc => {
                    accountCount++;
                    acc.currencyBalances.forEach(cb => {
                        balances[cb.currencyCode] = (balances[cb.currencyCode] || 0) + Number(cb.balance);
                    });
                });
            });

            return {
                accountCount,
                balances
            };
        }),

    adjustBalance: protectedProcedure
        .input(z.object({
            currencyBalanceId: z.string().uuid(),
            newBalance: z.number(),
            reason: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Fetch current balance
            const balance = await ctx.db.query.currencyBalances.findFirst({
                where: eq(currencyBalances.id, input.currencyBalanceId)
            });

            if (!balance) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Balance not found' });
            }

            const currentAmount = Number(balance.balance);
            const diff = input.newBalance - currentAmount;

            if (Math.abs(diff) < 0.01) {
                return { success: true }; // No change
            }

            // Find or create 'Adjustment' category
            let category = await ctx.db.query.categories.findFirst({
                where: (c, { ilike }) => ilike(c.name, 'Adjustment')
            });

            if (!category) {
                const [newCat] = await ctx.db.insert(categories).values({
                    name: 'Adjustment',
                    icon: '🔧',
                    color: '#64748b'
                }).returning();
                category = newCat;
            }

            // Create Transaction
            // If diff > 0, we gained money (Income)
            // If diff < 0, we lost money (Expense)
            const type = diff > 0 ? 'income' : 'expense';
            const amount = Math.abs(diff);

            await ctx.db.insert(transactions).values({
                currencyBalanceId: input.currencyBalanceId,
                categoryId: category.id,
                amount: amount.toString(),
                date: new Date().toISOString().split('T')[0],
                type: type,
                description: input.reason || 'Balance manual adjustment',
                excludeFromMonthlyStats: true, // Adjustments usually shouldn't skew monthly spending/income stats
            });

            // Update Balance
            await ctx.db.update(currencyBalances)
                .set({
                    balance: input.newBalance.toString(),
                    updatedAt: new Date(),
                })
                .where(eq(currencyBalances.id, input.currencyBalanceId));

            return { success: true };
        }),
});
