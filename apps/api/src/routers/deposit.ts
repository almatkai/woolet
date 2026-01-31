import { z } from 'zod';
import { eq, desc, sql, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { deposits, accounts, banks, currencyBalances } from '../db/schema';
import { checkEntityLimit } from '../lib/limits';

export const depositRouter = router({
    list: protectedProcedure
        .query(async ({ ctx }) => {
            const userBanks = await ctx.db.query.banks.findMany({
                where: and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ),
                with: { accounts: true }
            });

            const accountIds = userBanks.flatMap(b => b.accounts.map(a => a.id));
            if (accountIds.length === 0) return [];

            const allDeposits = await ctx.db.select().from(deposits)
                .orderBy(desc(deposits.createdAt));

            return allDeposits.filter(d => accountIds.includes(d.accountId));
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const deposit = await ctx.db.query.deposits.findFirst({
                where: eq(deposits.id, input.id),
                with: { account: true }
            });

            if (!deposit) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Deposit not found' });
            }

            return deposit;
        }),

    create: protectedProcedure
        .input(z.object({
            accountId: z.string().uuid(),
            currencyBalanceId: z.string().uuid(),
            depositName: z.string().min(1),
            principalAmount: z.number().positive(),
            currentBalance: z.number().min(0),
            interestRate: z.number().min(0).max(100),
            compoundingFrequency: z.enum(['daily', 'monthly', 'quarterly', 'annually']).default('monthly'),
            currency: z.string().length(3),
            startDate: z.string(),
            maturityDate: z.string().optional(),
            isFlexible: z.boolean().default(true),
            skipWithdrawal: z.boolean().default(false),
            status: z.enum(['active', 'matured', 'withdrawn']).default('active'),
        }))
        .mutation(async ({ ctx, input }) => {
            // Check test mode limits
            await checkEntityLimit(ctx.db, ctx.userId!, 'deposits');

            const account = await ctx.db.query.accounts.findFirst({
                where: eq(accounts.id, input.accountId),
                with: { bank: true }
            });

            if (!account || account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found' });
            }

            // Get bank name from account
            const bankName = account.bank.name;

            // Withdraw from account if not skipped
            if (!input.skipWithdrawal) {
                const balance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.currencyBalanceId)
                });

                if (!balance) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Currency balance not found' });
                }

                const currentBalance = Number(balance.balance);
                if (currentBalance < input.principalAmount) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Insufficient funds. You have ${currentBalance} ${balance.currencyCode} but need ${input.principalAmount}`
                    });
                }

                // Deduct principal from balance
                await ctx.db.update(currencyBalances)
                    .set({
                        balance: sql`${currencyBalances.balance} - ${input.principalAmount}`,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, input.currencyBalanceId));
            }

            const [deposit] = await ctx.db.insert(deposits).values({
                accountId: input.accountId,
                bankName,
                depositName: input.depositName,
                principalAmount: input.principalAmount.toString(),
                currentBalance: input.currentBalance.toString(),
                interestRate: input.interestRate.toString(),
                compoundingFrequency: input.compoundingFrequency,
                currency: input.currency,
                startDate: input.startDate,
                maturityDate: input.maturityDate,
                isFlexible: input.isFlexible,
                status: input.status,
            }).returning();

            return deposit;
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            depositName: z.string().min(1).optional(),
            currentBalance: z.number().min(0).optional(),
            interestRate: z.number().min(0).max(100).optional(),
            maturityDate: z.string().optional(),
            status: z.enum(['active', 'matured', 'withdrawn']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const updateData: Record<string, any> = {};

            if (input.depositName !== undefined) updateData.depositName = input.depositName;
            if (input.currentBalance !== undefined) updateData.currentBalance = input.currentBalance.toString();
            if (input.interestRate !== undefined) updateData.interestRate = input.interestRate.toString();
            if (input.maturityDate !== undefined) updateData.maturityDate = input.maturityDate;
            if (input.status !== undefined) updateData.status = input.status;

            await ctx.db.update(deposits)
                .set(updateData)
                .where(eq(deposits.id, input.id));

            return { success: true };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(deposits).where(eq(deposits.id, input.id));
            return { success: true };
        }),

    calculateInterest: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            months: z.number().int().positive().default(12),
        }))
        .query(async ({ ctx, input }) => {
            const deposit = await ctx.db.query.deposits.findFirst({
                where: eq(deposits.id, input.id)
            });

            if (!deposit) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Deposit not found' });
            }

            const principal = Number(deposit.currentBalance);
            const annualRate = Number(deposit.interestRate) / 100;

            // Compounding periods per year
            const periodsMap: Record<string, number> = {
                'daily': 365,
                'monthly': 12,
                'quarterly': 4,
                'annually': 1,
            };
            const n = periodsMap[deposit.compoundingFrequency] || 12;
            const years = input.months / 12;

            // Compound interest formula: A = P(1 + r/n)^(nt)
            const futureValue = principal * Math.pow(1 + annualRate / n, n * years);
            const interestEarned = futureValue - principal;

            return {
                currentBalance: principal,
                futureValue,
                interestEarned,
                months: input.months,
                effectiveRate: (Math.pow(1 + annualRate / n, n) - 1) * 100,
            };
        }),
});
