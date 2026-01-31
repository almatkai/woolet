import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { credits, accounts, banks, creditPayments, currencyBalances, transactions, categories } from '../db/schema';

export const creditRouter = router({
    list: protectedProcedure
        .query(async ({ ctx }) => {
            // Get all credits for user's accounts
            const userBanks = await ctx.db.query.banks.findMany({
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

            const accountIds = userBanks.flatMap(b => b.accounts.map(a => a.id));

            if (accountIds.length === 0) return [];

            const userCredits = await ctx.db.query.credits.findMany({
                where: inArray(credits.accountId, accountIds),
                orderBy: [desc(credits.createdAt)],
                with: {
                    account: {
                        with: {
                            currencyBalances: true
                        }
                    },
                    payments: true
                }
            });

            return userCredits;
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const credit = await ctx.db.query.credits.findFirst({
                where: eq(credits.id, input.id),
                with: {
                    account: {
                        with: {
                            currencyBalances: true,
                            bank: true
                        }
                    },
                    payments: true
                }
            });

            if (!credit) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            if (credit.account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            return credit;
        }),

    // Get paid months for a credit
    getPaidMonths: protectedProcedure
        .input(z.object({ creditId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const payments = await ctx.db.query.creditPayments.findMany({
                where: eq(creditPayments.creditId, input.creditId),
                orderBy: [desc(creditPayments.paidAt)]
            });

            return payments.map(p => p.monthYear);
        }),

    create: protectedProcedure
        .input(z.object({
            accountId: z.string().uuid(),
            name: z.string().min(1),
            principalAmount: z.number().positive(),
            interestRate: z.number().min(0).max(100),
            monthlyPayment: z.number().positive(),
            remainingBalance: z.number().min(0),
            currency: z.string().length(3),
            startDate: z.string(),
            endDate: z.string(),
            status: z.enum(['active', 'paid_off', 'defaulted']).default('active'),
            markPastMonthsAsPaid: z.boolean().default(true), // Auto-mark months from start to now as paid
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify account ownership
            const account = await ctx.db.query.accounts.findFirst({
                where: eq(accounts.id, input.accountId),
                with: { bank: true }
            });

            if (!account || account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found or access denied' });
            }

            if (account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `Cannot create credit in ${account.bank.isTest ? 'Test' : 'Production'} account while in ${ctx.user.testMode ? 'Test' : 'Production'} Mode.`
                });
            }

            const [credit] = await ctx.db.insert(credits).values({
                accountId: input.accountId,
                name: input.name,
                principalAmount: input.principalAmount.toString(),
                interestRate: input.interestRate.toString(),
                monthlyPayment: input.monthlyPayment.toString(),
                remainingBalance: input.remainingBalance.toString(),
                currency: input.currency,
                startDate: input.startDate,
                endDate: input.endDate,
                status: input.status,
            }).returning();

            // Auto-mark past months as paid (without deducting money)
            if (input.markPastMonthsAsPaid) {
                const startDate = new Date(input.startDate);
                const now = new Date();
                const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

                // Generate months from (start date + 1 month) to last month
                // First payment is due one month after start date
                const pastMonths: string[] = [];
                let current = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);

                while (current < currentMonth) {
                    const year = current.getFullYear();
                    const month = String(current.getMonth() + 1).padStart(2, '0');
                    pastMonths.push(`${year}-${month}`);
                    current.setMonth(current.getMonth() + 1);
                }

                if (pastMonths.length > 0) {
                    const paymentRecords = pastMonths.map(monthYear => ({
                        creditId: credit.id,
                        monthYear,
                        amount: input.monthlyPayment.toString(),
                    }));
                    await ctx.db.insert(creditPayments).values(paymentRecords);
                }
            }

            return credit;
        }),

    // Mark months as paid WITHOUT deducting money (skip payment)
    markAsPaid: protectedProcedure
        .input(z.object({
            creditId: z.string().uuid(),
            months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const credit = await ctx.db.query.credits.findFirst({
                where: eq(credits.id, input.creditId),
                with: {
                    account: { with: { bank: true } },
                    payments: true
                }
            });

            if (!credit) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            if (credit.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (credit.account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            // Filter out already paid months
            const alreadyPaid = credit.payments.map(p => p.monthYear);
            const monthsToMark = input.months.filter(m => !alreadyPaid.includes(m));

            if (monthsToMark.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'All selected months are already paid' });
            }

            // Create payment records WITHOUT deducting money
            const paymentRecords = monthsToMark.map(month => ({
                creditId: credit.id,
                monthYear: month,
                amount: credit.monthlyPayment,
            }));

            await ctx.db.insert(creditPayments).values(paymentRecords);

            // Update remaining balance
            const totalAmount = Number(credit.monthlyPayment) * monthsToMark.length;
            const newRemainingBalance = Math.max(0, Number(credit.remainingBalance) - totalAmount);
            const newStatus = newRemainingBalance === 0 ? 'paid_off' : credit.status;

            await ctx.db.update(credits)
                .set({
                    remainingBalance: newRemainingBalance.toString(),
                    status: newStatus,
                })
                .where(eq(credits.id, credit.id));

            return {
                success: true,
                markedMonths: monthsToMark,
                newRemainingBalance,
                status: newStatus
            };
        }),


    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().min(1).optional(),
            monthlyPayment: z.number().positive().optional(),
            remainingBalance: z.number().min(0).optional(),
            status: z.enum(['active', 'paid_off', 'defaulted']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const updateData: Record<string, any> = {};

            if (input.name !== undefined) updateData.name = input.name;
            if (input.monthlyPayment !== undefined) updateData.monthlyPayment = input.monthlyPayment.toString();
            if (input.remainingBalance !== undefined) updateData.remainingBalance = input.remainingBalance.toString();
            if (input.status !== undefined) updateData.status = input.status;

            if (Object.keys(updateData).length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' });
            }

            await ctx.db.update(credits)
                .set(updateData)
                .where(eq(credits.id, input.id));

            return { success: true };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(credits).where(eq(credits.id, input.id));
            return { success: true };
        }),

    // Make monthly payment(s) - deducts from account and records payment
    makeMonthlyPayment: protectedProcedure
        .input(z.object({
            creditId: z.string().uuid(),
            months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1), // Array of "YYYY-MM" strings
        }))
        .mutation(async ({ ctx, input }) => {
            // 1. Get the credit with account info
            const credit = await ctx.db.query.credits.findFirst({
                where: eq(credits.id, input.creditId),
                with: {
                    account: {
                        with: {
                            currencyBalances: true,
                            bank: true
                        }
                    },
                    payments: true
                }
            });

            if (!credit) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            // Verify ownership
            if (credit.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (credit.account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            // 2. Check which months are already paid
            const alreadyPaid = credit.payments.map(p => p.monthYear);
            const monthsToPayFor = input.months.filter(m => !alreadyPaid.includes(m));

            if (monthsToPayFor.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'All selected months are already paid' });
            }

            // 3. Calculate total amount
            const monthlyPayment = Number(credit.monthlyPayment);
            const totalAmount = monthlyPayment * monthsToPayFor.length;

            // 4. Find the currency balance for this credit's currency
            const currencyBalance = credit.account.currencyBalances.find(
                cb => cb.currencyCode === credit.currency
            );

            if (!currencyBalance) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `No ${credit.currency} balance found in the linked account`
                });
            }

            // 5. Check sufficient balance
            const currentBalance = Number(currencyBalance.balance);
            if (currentBalance < totalAmount) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Insufficient balance. Need ${totalAmount.toLocaleString()} ${credit.currency}, but only have ${currentBalance.toLocaleString()} ${credit.currency}`
                });
            }

            // 6. Get or create a "Bills" category for the transaction
            let billsCategory = await ctx.db.query.categories.findFirst({
                where: eq(categories.name, 'Bills')
            });

            if (!billsCategory) {
                const [newCat] = await ctx.db.insert(categories).values({
                    name: 'Bills',
                    icon: '📄',
                    color: '#FFEAA7',
                    type: 'expense',
                    userId: null
                }).returning();
                billsCategory = newCat;
            }

            // 7. Deduct from currency balance
            const newBalance = currentBalance - totalAmount;
            await ctx.db.update(currencyBalances)
                .set({
                    balance: newBalance.toString(),
                    updatedAt: new Date()
                })
                .where(eq(currencyBalances.id, currencyBalance.id));

            // 8. Create credit payment records for each month
            const paymentRecords = monthsToPayFor.map(month => ({
                creditId: credit.id,
                monthYear: month,
                amount: monthlyPayment.toString(),
            }));

            await ctx.db.insert(creditPayments).values(paymentRecords);

            // 9. Create expense transaction
            const monthsDescription = monthsToPayFor.length === 1
                ? monthsToPayFor[0]
                : `${monthsToPayFor[0]} - ${monthsToPayFor[monthsToPayFor.length - 1]}`;

            await ctx.db.insert(transactions).values({
                currencyBalanceId: currencyBalance.id,
                categoryId: billsCategory.id,
                amount: (-totalAmount).toString(),
                description: `${credit.name} payment (${monthsDescription})`,
                date: new Date().toISOString().split('T')[0],
                type: 'expense',
                excludeFromMonthlyStats: true // Credit payments are tracked separately
            });

            // 10. Update credit remaining balance
            const newRemainingBalance = Math.max(0, Number(credit.remainingBalance) - totalAmount);
            const newStatus = newRemainingBalance === 0 ? 'paid_off' : credit.status;

            await ctx.db.update(credits)
                .set({
                    remainingBalance: newRemainingBalance.toString(),
                    status: newStatus,
                })
                .where(eq(credits.id, credit.id));

            return {
                success: true,
                paidMonths: monthsToPayFor,
                totalAmount,
                newAccountBalance: newBalance,
                newRemainingBalance,
                status: newStatus
            };
        }),

    // Legacy simple payment (kept for backwards compatibility)
    makePayment: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            amount: z.number().positive(),
        }))
        .mutation(async ({ ctx, input }) => {
            const credit = await ctx.db.query.credits.findFirst({
                where: eq(credits.id, input.id),
                with: {
                    account: { with: { bank: true } }
                }
            });

            if (!credit) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            if (credit.account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Credit not found' });
            }

            const newBalance = Math.max(0, Number(credit.remainingBalance) - input.amount);
            const newStatus = newBalance === 0 ? 'paid_off' : credit.status;

            await ctx.db.update(credits)
                .set({
                    remainingBalance: newBalance.toString(),
                    status: newStatus,
                })
                .where(eq(credits.id, input.id));

            return { success: true, newBalance, status: newStatus };
        }),
});

