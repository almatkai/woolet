import { z } from 'zod';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { mortgages, accounts, banks, mortgagePayments, currencyBalances, transactions, categories } from '../db/schema';
import { checkEntityLimit } from '../lib/limits';

export const mortgageRouter = router({
    list: protectedProcedure
        .query(async ({ ctx }) => {
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

            const userMortgages = await ctx.db.query.mortgages.findMany({
                where: inArray(mortgages.accountId, accountIds),
                orderBy: [desc(mortgages.createdAt)],
                with: {
                    account: {
                        with: {
                            currencyBalances: true
                        }
                    },
                    payments: true
                }
            });

            return userMortgages;
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const mortgage = await ctx.db.query.mortgages.findFirst({
                where: eq(mortgages.id, input.id),
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

            if (!mortgage) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Mortgage not found' });
            }

            return mortgage;
        }),

    create: protectedProcedure
        .input(z.object({
            accountId: z.string().uuid(),
            propertyName: z.string().min(1),
            propertyAddress: z.string().optional(),
            principalAmount: z.number().positive(),
            interestRate: z.number().min(0).max(100),
            monthlyPayment: z.number().positive(),
            remainingBalance: z.number().min(0),
            currency: z.string().length(3),
            startDate: z.string(),
            endDate: z.string().optional(),
            termYears: z.number().int().positive(),
            paymentDay: z.number().int().min(1).max(31).default(1),
            status: z.enum(['active', 'paid_off', 'defaulted']).default('active'),
            markPastMonthsAsPaid: z.boolean().default(true),
        }))
        .mutation(async ({ ctx, input }) => {
            // Check test mode limits
            await checkEntityLimit(ctx.db, ctx.userId!, 'mortgages');

            const account = await ctx.db.query.accounts.findFirst({
                where: eq(accounts.id, input.accountId),
                with: { bank: true }
            });

            if (!account || account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found' });
            }

            if (account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `Cannot create mortgage in ${account.bank.isTest ? 'Test' : 'Production'} account while in ${ctx.user.testMode ? 'Test' : 'Production'} Mode.`
                });
            }

            // Calculate end date from start date and term years if not provided
            const startDate = new Date(input.startDate);
            const endDate = input.endDate || new Date(startDate.getFullYear() + input.termYears, startDate.getMonth(), startDate.getDate()).toISOString().split('T')[0];

            const [mortgage] = await ctx.db.insert(mortgages).values({
                accountId: input.accountId,
                propertyName: input.propertyName,
                propertyAddress: input.propertyAddress,
                principalAmount: input.principalAmount.toString(),
                interestRate: input.interestRate.toString(),
                monthlyPayment: input.monthlyPayment.toString(),
                remainingBalance: input.remainingBalance.toString(),
                currency: input.currency,
                startDate: input.startDate,
                endDate: endDate,
                termYears: input.termYears,
                paymentDay: input.paymentDay,
                status: input.status,
            }).returning();

            // Auto-mark past months as paid (without deducting money)
            if (input.markPastMonthsAsPaid) {
                const now = new Date();
                const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
                        mortgageId: mortgage.id,
                        monthYear,
                        amount: input.monthlyPayment.toString(),
                    }));
                    await ctx.db.insert(mortgagePayments).values(paymentRecords);
                }
            }

            return mortgage;
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            propertyName: z.string().min(1).optional(),
            propertyAddress: z.string().optional(),
            monthlyPayment: z.number().positive().optional(),
            remainingBalance: z.number().min(0).optional(),
            paymentDay: z.number().int().min(1).max(31).optional(),
            status: z.enum(['active', 'paid_off', 'defaulted']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const updateData: Record<string, any> = {};

            if (input.propertyName !== undefined) updateData.propertyName = input.propertyName;
            if (input.propertyAddress !== undefined) updateData.propertyAddress = input.propertyAddress;
            if (input.monthlyPayment !== undefined) updateData.monthlyPayment = input.monthlyPayment.toString();
            if (input.remainingBalance !== undefined) updateData.remainingBalance = input.remainingBalance.toString();
            if (input.paymentDay !== undefined) updateData.paymentDay = input.paymentDay;
            if (input.status !== undefined) updateData.status = input.status;

            await ctx.db.update(mortgages)
                .set(updateData)
                .where(eq(mortgages.id, input.id));

            return { success: true };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(mortgages).where(eq(mortgages.id, input.id));
            return { success: true };
        }),

    // Mark months as paid WITHOUT deducting money (skip payment)
    markAsPaid: protectedProcedure
        .input(z.object({
            mortgageId: z.string().uuid(),
            months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const mortgage = await ctx.db.query.mortgages.findFirst({
                where: eq(mortgages.id, input.mortgageId),
                with: {
                    account: { with: { bank: true } },
                    payments: true
                }
            });

            if (!mortgage) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Mortgage not found' });
            }

            if (mortgage.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (mortgage.account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Mortgage not found' });
            }

            // Filter out already paid months
            const alreadyPaid = mortgage.payments.map(p => p.monthYear);
            const monthsToMark = input.months.filter(m => !alreadyPaid.includes(m));

            if (monthsToMark.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'All selected months are already paid' });
            }

            // Create payment records WITHOUT deducting money
            const paymentRecords = monthsToMark.map(month => ({
                mortgageId: mortgage.id,
                monthYear: month,
                amount: mortgage.monthlyPayment,
            }));

            await ctx.db.insert(mortgagePayments).values(paymentRecords);

            // Update remaining balance
            const totalAmount = Number(mortgage.monthlyPayment) * monthsToMark.length;
            const newRemainingBalance = Math.max(0, Number(mortgage.remainingBalance) - totalAmount);
            const newStatus = newRemainingBalance === 0 ? 'paid_off' : mortgage.status;

            await ctx.db.update(mortgages)
                .set({
                    remainingBalance: newRemainingBalance.toString(),
                    status: newStatus,
                })
                .where(eq(mortgages.id, mortgage.id));

            return {
                success: true,
                markedMonths: monthsToMark,
                newRemainingBalance,
                status: newStatus
            };
        }),

    // Make monthly payment(s) - deducts from account and records payment
    makeMonthlyPayment: protectedProcedure
        .input(z.object({
            mortgageId: z.string().uuid(),
            months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const mortgage = await ctx.db.query.mortgages.findFirst({
                where: eq(mortgages.id, input.mortgageId),
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

            if (!mortgage) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Mortgage not found' });
            }

            if (mortgage.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            if (mortgage.account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Mortgage not found' });
            }

            // Check which months are already paid
            const alreadyPaid = mortgage.payments.map(p => p.monthYear);
            const monthsToPayFor = input.months.filter(m => !alreadyPaid.includes(m));

            if (monthsToPayFor.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'All selected months are already paid' });
            }

            // Calculate total amount
            const monthlyPayment = Number(mortgage.monthlyPayment);
            const totalAmount = monthlyPayment * monthsToPayFor.length;

            // Find the currency balance for this mortgage's currency
            const currencyBalance = mortgage.account.currencyBalances.find(
                cb => cb.currencyCode === mortgage.currency
            );

            if (!currencyBalance) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `No ${mortgage.currency} balance found in the linked account`
                });
            }

            // Check sufficient balance
            const currentBalance = Number(currencyBalance.balance);
            if (currentBalance < totalAmount) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Insufficient balance. Need ${totalAmount.toLocaleString()} ${mortgage.currency}, but only have ${currentBalance.toLocaleString()} ${mortgage.currency}`
                });
            }

            // Get or create a "Mortgage" category for the transaction
            let mortgageCategory = await ctx.db.query.categories.findFirst({
                where: eq(categories.name, 'Mortgage')
            });

            if (!mortgageCategory) {
                const [newCat] = await ctx.db.insert(categories).values({
                    name: 'Mortgage',
                    icon: '🏠',
                    color: '#8B4513',
                    type: 'expense',
                    userId: null
                }).returning();
                mortgageCategory = newCat;
            }

            // Deduct from currency balance
            const newBalance = currentBalance - totalAmount;
            await ctx.db.update(currencyBalances)
                .set({
                    balance: newBalance.toString(),
                    updatedAt: new Date()
                })
                .where(eq(currencyBalances.id, currencyBalance.id));

            // Create mortgage payment records for each month
            const paymentRecords = monthsToPayFor.map(month => ({
                mortgageId: mortgage.id,
                monthYear: month,
                amount: monthlyPayment.toString(),
            }));

            await ctx.db.insert(mortgagePayments).values(paymentRecords);

            // Create expense transaction
            const monthsDescription = monthsToPayFor.length === 1
                ? monthsToPayFor[0]
                : `${monthsToPayFor[0]} - ${monthsToPayFor[monthsToPayFor.length - 1]}`;

            await ctx.db.insert(transactions).values({
                currencyBalanceId: currencyBalance.id,
                categoryId: mortgageCategory.id,
                amount: (-totalAmount).toString(),
                description: `${mortgage.propertyName} mortgage payment (${monthsDescription})`,
                date: new Date().toISOString().split('T')[0],
                type: 'expense',
                excludeFromMonthlyStats: true
            });

            // Update mortgage remaining balance
            const newRemainingBalance = Math.max(0, Number(mortgage.remainingBalance) - totalAmount);
            const newStatus = newRemainingBalance === 0 ? 'paid_off' : mortgage.status;

            await ctx.db.update(mortgages)
                .set({
                    remainingBalance: newRemainingBalance.toString(),
                    status: newStatus,
                })
                .where(eq(mortgages.id, mortgage.id));

            return {
                success: true,
                paidMonths: monthsToPayFor,
                totalAmount,
                newAccountBalance: newBalance,
                newRemainingBalance,
                status: newStatus
            };
        }),

    getAmortizationSchedule: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const mortgage = await ctx.db.query.mortgages.findFirst({
                where: eq(mortgages.id, input.id),
                with: { payments: true }
            });

            if (!mortgage) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Mortgage not found' });
            }

            // Get paid months
            const paidMonths = new Set(mortgage.payments.map(p => p.monthYear));

            // Calculate amortization schedule
            const principal = Number(mortgage.principalAmount);
            const annualRate = Number(mortgage.interestRate) / 100;
            const monthlyRate = annualRate / 12;
            const totalMonths = mortgage.termYears * 12;
            const monthlyPayment = Number(mortgage.monthlyPayment);

            const schedule = [];
            let balance = principal;
            const startDate = new Date(mortgage.startDate);

            for (let month = 1; month <= totalMonths && balance > 0; month++) {
                const interestPayment = balance * monthlyRate;
                const principalPayment = Math.min(monthlyPayment - interestPayment, balance);
                balance = Math.max(0, balance - principalPayment);

                // Calculate the month-year for this payment
                const paymentDate = new Date(startDate.getFullYear(), startDate.getMonth() + month, 1);
                const monthYear = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;

                schedule.push({
                    month,
                    monthYear,
                    payment: monthlyPayment,
                    principal: principalPayment,
                    interest: interestPayment,
                    balance,
                    isPaid: paidMonths.has(monthYear),
                });
            }

            return schedule;
        }),
});
