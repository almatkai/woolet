import { z } from 'zod';
import { eq, desc, sql, and, lt, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { debts, currencyBalances, debtPayments, transactions, categories } from '../db/schema';
import { checkEntityLimit } from '../lib/limits';

export const debtRouter = router({
    list: protectedProcedure
        .input(z.object({ cursor: z.string().nullish() }))
        .query(async ({ ctx }) => {
            // 0. Lazy Cleanup: Find debts in 'deleting' state updated > 10s ago
            const expiredDeletingDebts = await ctx.db.query.debts.findMany({
                where: and(
                    eq(debts.lifecycleStatus, 'deleting'),
                    lt(debts.updatedAt, new Date(Date.now() - 10000)) // 10s ago
                )
            });

            // Hard delete expired debts (balances already reverted during soft delete)
            for (const debt of expiredDeletingDebts) {
                await ctx.db.delete(debts).where(eq(debts.id, debt.id));
            }

            // Need to fetch debts and total
            const items = await ctx.db.query.debts.findMany({
                where: and(
                    eq(debts.userId, ctx.userId!),
                    eq(debts.isTest, ctx.user.testMode),
                    eq(debts.lifecycleStatus, 'active')
                ),
                orderBy: [desc(debts.createdAt)],
                with: {
                    currencyBalance: {
                        with: {
                            account: {
                                with: {
                                    bank: true
                                }
                            },
                            currency: true
                        }
                    },
                    payments: {
                        orderBy: [desc(debtPayments.paidAt)],
                        with: {
                            transactions: {
                                with: {
                                    currencyBalance: {
                                        with: {
                                            account: {
                                                with: {
                                                    bank: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            return {
                debts: items,
                total: items.length
            };
        }),

    create: protectedProcedure
        .input(z.object({
            currencyBalanceId: z.string().uuid().optional().nullable(),
            currencyCode: z.string().optional().nullable(),
            personName: z.string().min(1),
            amount: z.number().positive(),
            type: z.enum(['i_owe', 'they_owe']),
            description: z.string().optional(),
            dueDate: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Check test mode limits
            await checkEntityLimit(ctx.db, ctx.userId!, 'debts');

            // 1. Validation: Must have either balanceId or currencyCode
            if (!input.currencyBalanceId && !input.currencyCode) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Either an account or a currency must be selected.'
                });
            }

            // Check balance if lending money and tracked
            if (input.type === 'they_owe' && input.currencyBalanceId) {
                const balance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.currencyBalanceId)
                });

                if (!balance) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Balance not found' });
                }

                if (Number(balance.balance) < input.amount) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Insufficient funds. You only have ${balance.balance} ${balance.currencyCode} but are trying to lend ${input.amount}.`
                    });
                }
            }

            // 2. Create Debt Record
            const [debt] = await ctx.db.insert(debts).values({
                currencyBalanceId: input.currencyBalanceId,
                currencyCode: input.currencyCode,
                personName: input.personName,
                amount: input.amount.toString(),
                type: input.type,
                description: input.description,
                dueDate: input.dueDate,
                userId: ctx.userId!,
                isTest: ctx.user.testMode,
            }).returning();

            // 3. Skip tracking if not linked to a balance
            if (!input.currencyBalanceId) {
                return debt;
            }

            // 4. Find or Create 'Debt' Category
            let category = await ctx.db.query.categories.findFirst({
                where: (c, { ilike }) => ilike(c.name, 'Debt')
            });

            if (!category) {
                const [newCat] = await ctx.db.insert(categories).values({
                    name: 'Debt',
                    icon: '💸',
                    color: '#f43f5e'
                }).returning();
                category = newCat;
            }

            // 5. Update Balance
            const balanceChange = input.type === 'i_owe'
                ? sql`${currencyBalances.balance} + ${input.amount}`
                : sql`${currencyBalances.balance} - ${input.amount}`;

            await ctx.db.update(currencyBalances)
                .set({
                    balance: balanceChange,
                    updatedAt: new Date()
                })
                .where(eq(currencyBalances.id, input.currencyBalanceId));

            // 6. Create Transaction
            await ctx.db.insert(transactions).values({
                currencyBalanceId: input.currencyBalanceId,
                categoryId: category.id,
                amount: input.amount.toString(),
                date: new Date().toISOString().split('T')[0], // Today
                type: input.type === 'i_owe' ? 'income' : 'expense',
                description: `Debt: ${input.type === 'i_owe' ? 'Borrowed from' : 'Lent to'} ${input.personName}${input.description ? ` - ${input.description}` : ''}`,
                debtId: debt.id,
                excludeFromMonthlyStats: false,
            });

            return debt;
        }),

    addPayment: protectedProcedure
        .input(z.object({
            debtId: z.string().uuid(),
            amount: z.number().positive(),
            paymentDate: z.string(), // ISO date string
            note: z.string().optional(),
            distributions: z.array(z.object({
                currencyBalanceId: z.string().uuid(),
                amount: z.number().positive()
            })).min(1)
        }))
        .mutation(async ({ ctx, input }) => {
            const debt = await ctx.db.query.debts.findFirst({
                where: and(
                    eq(debts.id, input.debtId),
                    eq(debts.userId, ctx.userId!)
                ),
                with: {
                    currencyBalance: true
                }
            });

            if (!debt) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Debt not found' });
            }

            // Verify total distribution matches amount
            const totalDistributed = input.distributions.reduce((sum, d) => sum + d.amount, 0);
            if (Math.abs(totalDistributed - input.amount) > 0.01) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Distribution total (${totalDistributed}) does not match payment amount (${input.amount})`
                });
            }

            // Verify not overpaying
            const currentPaid = Number(debt.paidAmount);
            const totalDebt = Number(debt.amount);
            if (currentPaid + input.amount > totalDebt + 0.01) { // small epsilon for float math
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Payment amount exceeds remaining debt`
                });
            }

            // Verify currency consistency (simplification: strict same currency)
            // Retrieve all target currency balances to check their currency codes
            const targetBalanceIds = input.distributions.map(d => d.currencyBalanceId);
            const targetBalances = await ctx.db.query.currencyBalances.findMany({
                where: (table, { inArray }) => inArray(table.id, targetBalanceIds)
            });

            const debtCurrency = debt.currencyBalanceId ? (debt.currencyBalance as any).currencyCode : debt.currencyCode;
            for (const balance of targetBalances) {
                if (balance.currencyCode !== debtCurrency) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Target account currency (${balance.currencyCode}) does not match debt currency (${debtCurrency})`
                    });
                }
            }

            // 1. Record Debt Payment
            const [paymentRecord] = await ctx.db.insert(debtPayments).values({
                debtId: debt.id,
                amount: input.amount.toString(),
                paidAt: new Date(input.paymentDate),
                note: input.note,
            }).returning();

            // 2. Update Debt Status
            const newPaidAmount = currentPaid + input.amount;
            const newStatus = Math.abs(totalDebt - newPaidAmount) < 0.01 ? 'paid' : 'partial';

            await ctx.db.update(debts)
                .set({
                    paidAmount: newPaidAmount.toString(),
                    status: newStatus,
                    updatedAt: new Date()
                })
                .where(eq(debts.id, debt.id));

            // 3. Process Distributions (Update Balance + Create Transaction)
            // We need a category for 'Debt Repayment'.
            // For now, we'll try to find one or fail gracefully (or maybe just leave categoryId nullable if schema allowed, but it's not null)
            // Let's assume there is an 'Income' or 'Transfer' category, or we just pick the first one available if we can't find a specific one.
            // Ideally, we should seed/ensure a 'Debt Repayment' category exists.
            // For this iteration, I'll fetch *any* category or a specific one if I knew the seed data.
            // Better approach: Require category selection in UI? Or just pick one.
            // Let's search for a category named 'Debt' or 'Income' or 'Transfer'.

            // Find or create 'Debt Repayment' category
            let category = await ctx.db.query.categories.findFirst({
                where: (c, { eq }) => eq(c.name, 'Debt Repayment')
            });

            if (!category) {
                // Try finding one with 'debt' in name
                category = await ctx.db.query.categories.findFirst({
                    where: (c, { ilike }) => ilike(c.name, '%debt%')
                });
            }

            if (!category) {
                // Create it if it doesn't exist
                const [newCat] = await ctx.db.insert(categories).values({
                    name: 'Debt Repayment',
                    icon: '💸',
                    color: '#f43f5e' // Rose-500 default for debt
                }).returning();
                category = newCat;
            }

            for (const dist of input.distributions) {
                // Update Balance
                // Update Balance
                // If I owe (i_owe), I am paying OUT, so balance DECREASES.
                // If they owe me (they_owe), I am receiving money, so balance INCREASES.
                const balanceChange = debt.type === 'they_owe'
                    ? sql`${currencyBalances.balance} + ${dist.amount}`
                    : sql`${currencyBalances.balance} - ${dist.amount}`;

                await ctx.db.update(currencyBalances)
                    .set({
                        balance: balanceChange,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, dist.currencyBalanceId));

                // Determine if this repayment should be excluded from monthly stats
                // Exclude if debt was created in the same month as the repayment
                const debtCreatedDate = new Date(debt.createdAt);
                const repaymentDate = new Date(input.paymentDate);
                const isSameMonth = debtCreatedDate.getFullYear() === repaymentDate.getFullYear()
                    && debtCreatedDate.getMonth() === repaymentDate.getMonth();

                // Create Transaction
                await ctx.db.insert(transactions).values({
                    currencyBalanceId: dist.currencyBalanceId,
                    categoryId: category.id,
                    amount: dist.amount.toString(),
                    date: input.paymentDate, // Just date string YYYY-MM-DD
                    type: debt.type === 'they_owe' ? 'income' : 'expense', // If they paid me, it's income. If I paid them, it's expense/transfer.
                    description: `Repayment from ${debt.personName}${input.note ? ` - ${input.note}` : ''}`,
                    debtPaymentId: paymentRecord.id,
                    excludeFromMonthlyStats: isSameMonth,
                });
            }

            return { success: true };
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            personName: z.string().min(1).optional(),
            amount: z.number().positive().optional(),
            description: z.string().optional(),
            dueDate: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...data } = input;

            const debt = await ctx.db.query.debts.findFirst({
                where: and(
                    eq(debts.id, id),
                    eq(debts.userId, ctx.userId!)
                )
            });

            if (!debt) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Debt not found' });
            }

            const updateValues: any = {
                ...data,
                updatedAt: new Date(),
            };

            if (data.amount) {
                updateValues.amount = data.amount.toString();
                // Re-calculate status
                const paidAmount = Number(debt.paidAmount);
                const status = paidAmount >= data.amount - 0.01 ? 'paid' : (paidAmount > 0 ? 'partial' : 'pending');
                updateValues.status = status;
            }

            await ctx.db.update(debts)
                .set(updateValues)
                .where(eq(debts.id, id));

            return { success: true };
        }),

    updatePayment: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            amount: z.number().positive().optional(),
            paidAt: z.string().optional(),
            note: z.string().optional(),
            distributions: z.array(z.object({
                currencyBalanceId: z.string().uuid(),
                amount: z.number().positive()
            })).optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...data } = input;

            const payment = await ctx.db.query.debtPayments.findFirst({
                where: eq(debtPayments.id, id),
                with: {
                    debt: {
                        with: {
                            currencyBalance: true
                        }
                    }
                }
            });

            if (!payment) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
            }

            const debt = payment.debt;
            const updateValues: any = {
                note: data.note,
                updatedAt: new Date(),
            };

            if (data.paidAt) {
                updateValues.paidAt = new Date(data.paidAt);
            }

            if (data.amount !== undefined || data.distributions !== undefined) {
                const newAmount = data.amount ?? Number(payment.amount);
                const distributions = data.distributions;

                // 1. Revert Old Balances
                const oldTransactions = await ctx.db.query.transactions.findMany({
                    where: eq(transactions.debtPaymentId, id)
                });

                for (const tx of oldTransactions) {
                    const balanceChange = tx.type === 'income'
                        ? sql`${currencyBalances.balance} - ${tx.amount}`
                        : sql`${currencyBalances.balance} + ${tx.amount}`;

                    await ctx.db.update(currencyBalances)
                        .set({
                            balance: balanceChange,
                            updatedAt: new Date()
                        })
                        .where(eq(currencyBalances.id, tx.currencyBalanceId));
                }

                // 2. Delete Old Transactions
                await ctx.db.delete(transactions).where(eq(transactions.debtPaymentId, id));

                // 3. Update Debt paidAmount & Status (if total amount changed)
                if (data.amount !== undefined) {
                    const diff = newAmount - Number(payment.amount);
                    const newPaidAmount = Number(debt.paidAmount) + diff;
                    const totalDebt = Number(debt.amount);

                    if (newPaidAmount > totalDebt + 0.01) {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: `Updated payment amount would exceed total debt.`
                        });
                    }

                    const newStatus = newPaidAmount >= totalDebt - 0.01 ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'pending');

                    await ctx.db.update(debts)
                        .set({
                            paidAmount: newPaidAmount.toString(),
                            status: newStatus,
                            updatedAt: new Date()
                        })
                        .where(eq(debts.id, debt.id));

                    updateValues.amount = newAmount.toString();
                }

                // 4. Create New Transactions (if distributions provided or amount changed)
                // If distributions NOT provided but amount changed, we need a default.
                // But from UI we will always send distributions if we support splitting.
                // For now, if distributions is undefined, we assume the single original account?
                // Actually, if we're in "Edit" mode, we should have the distributions.
                const finalDistributions = distributions ?? (oldTransactions.length === 1 ? [{
                    currencyBalanceId: oldTransactions[0].currencyBalanceId,
                    amount: newAmount
                }] : []);

                if (finalDistributions.length > 0) {
                    // Find or create 'Debt Repayment' category (same logic as addPayment)
                    let category = await ctx.db.query.categories.findFirst({
                        where: (c, { ilike }) => ilike(c.name, '%debt%')
                    });
                    if (!category) {
                        const [newCat] = await ctx.db.insert(categories).values({
                            name: 'Debt Repayment',
                            icon: '💸',
                            color: '#f43f5e'
                        }).returning();
                        category = newCat;
                    }

                    for (const dist of finalDistributions) {
                        // Update Balance
                        const balanceChange = debt.type === 'they_owe'
                            ? sql`${currencyBalances.balance} + ${dist.amount}`
                            : sql`${currencyBalances.balance} - ${dist.amount}`;

                        await ctx.db.update(currencyBalances)
                            .set({
                                balance: balanceChange,
                                updatedAt: new Date()
                            })
                            .where(eq(currencyBalances.id, dist.currencyBalanceId));

                        // Determine if this repayment should be excluded from monthly stats
                        const debtCreatedDate = new Date(debt.createdAt);
                        const repaymentDate = new Date(data.paidAt ?? payment.paidAt);
                        const isSameMonth = debtCreatedDate.getFullYear() === repaymentDate.getFullYear()
                            && debtCreatedDate.getMonth() === repaymentDate.getMonth();

                        // Create Transaction
                        await ctx.db.insert(transactions).values({
                            currencyBalanceId: dist.currencyBalanceId,
                            categoryId: category.id,
                            amount: dist.amount.toString(),
                            date: data.paidAt ?? payment.paidAt.toISOString().split('T')[0],
                            type: debt.type === 'they_owe' ? 'income' : 'expense',
                            description: `Repayment from ${debt.personName}${data.note ?? payment.note ? ` - ${data.note ?? payment.note}` : ''}`,
                            debtPaymentId: id,
                            excludeFromMonthlyStats: isSameMonth,
                        });
                    }
                }
            }

            await ctx.db.update(debtPayments)
                .set(updateValues)
                .where(eq(debtPayments.id, id));

            return { success: true };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // 1. Revert initial debt creation transaction(s)
            const linkedTransactions = await ctx.db.query.transactions.findMany({
                where: eq(transactions.debtId, input.id)
            });

            for (const tx of linkedTransactions) {
                const amount = Number(tx.amount);
                // If it was income (I owed), revert by subtracting.
                // If it was expense (They owed), revert by adding.
                const balanceChange = tx.type === 'income'
                    ? sql`${currencyBalances.balance} - ${amount}`
                    : sql`${currencyBalances.balance} + ${amount}`;

                await ctx.db.update(currencyBalances)
                    .set({
                        balance: balanceChange,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, tx.currencyBalanceId));
            }

            // 2. Revert any payments made (if cascading doesn't handle balance updates, which it doesn't automatically)
            // Wait, payments also created transactions.
            // If we delete the debt, the payments are deleted by cascade (schema has onDelete: 'cascade' on debtPayment.debtId).
            // BUT deleting payment record via cascade DOES NOT trigger our `deletePayment` logic which restores balance.
            // So we must manually revert balances for all payments too!

            const payments = await ctx.db.query.debtPayments.findMany({
                where: eq(debtPayments.debtId, input.id)
            });

            for (const payment of payments) {
                // Find transactions for this payment
                const paymentTransactions = await ctx.db.query.transactions.findMany({
                    where: eq(transactions.debtPaymentId, payment.id)
                });

                for (const tx of paymentTransactions) {
                    const amount = Number(tx.amount);
                    const balanceChange = tx.type === 'income'
                        ? sql`${currencyBalances.balance} - ${amount}`
                        : sql`${currencyBalances.balance} + ${amount}`;

                    await ctx.db.update(currencyBalances)
                        .set({
                            balance: balanceChange,
                            updatedAt: new Date()
                        })
                        .where(eq(currencyBalances.id, tx.currencyBalanceId));
                }
            }

            // Note: Transactions linked to payments will be deleted by Cascade on debtPaymentId?
            // Yes, checking transactions schema: debtPaymentId references debtPayments ... { onDelete: 'cascade' }
            // And debtPayments references debts ... { onDelete: 'cascade' }
            // So deleting debt -> deletes payments -> deletes transactions.
            // We just needed to fix the balances first.

            // Explicitly remove transactions tied to payments to ensure account history is cleaned up
            // (some DB setups or manual deletions may leave orphaned transactions; this is defensive).
            const paymentIds = payments.map(p => p.id);
            if (paymentIds.length) {
                await ctx.db.delete(transactions).where(inArray(transactions.debtPaymentId, paymentIds));
            }

            // Also delete any direct transactions that reference the debt (initial creation entries)
            await ctx.db.delete(transactions).where(eq(transactions.debtId, input.id));

            await ctx.db.delete(debts).where(eq(debts.id, input.id));
            return { success: true };
        }),

    deletePayment: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Get payment first to know amount and debtId
            const payment = await ctx.db.query.debtPayments.findFirst({
                where: eq(debtPayments.id, input.id),
                with: {
                    debt: {
                        with: {
                            currencyBalance: true
                        }
                    }
                }
            });

            if (!payment) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
            }

            const debt = payment.debt;
            // 1. Revert Account Balances using linked transactions
            const transactionsToRevert = await ctx.db.query.transactions.findMany({
                where: eq(transactions.debtPaymentId, input.id)
            });

            for (const tx of transactionsToRevert) {
                const amount = Number(tx.amount);
                // If we recorded receiving money (income for they_owe), subtract it back
                // If we recorded paying money (expense for i_owe), add it back
                const balanceChange = tx.type === 'income'
                    ? sql`${currencyBalances.balance} - ${amount}`
                    : sql`${currencyBalances.balance} + ${amount}`;

                await ctx.db.update(currencyBalances)
                    .set({
                        balance: balanceChange,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, tx.currencyBalanceId));
            }

            // 2. Revert Debt Status
            const amount = Number(payment.amount);
            const currentPaid = Number(debt.paidAmount);
            const newPaid = Math.max(0, currentPaid - amount);
            const totalDebt = Number(debt.amount);
            const newStatus = newPaid >= totalDebt - 0.01 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');

            await ctx.db.update(debts)
                .set({
                    paidAmount: newPaid.toString(),
                    status: newStatus,
                    updatedAt: new Date()
                })
                .where(eq(debts.id, debt.id));

            // 3. Delete Payment (will cascade delete transactions)
            await ctx.db.delete(debtPayments).where(eq(debtPayments.id, input.id));

            return { success: true };
        }),

    softDelete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const debt = await ctx.db.query.debts.findFirst({
                where: and(
                    eq(debts.id, input.id),
                    eq(debts.userId, ctx.userId!)
                )
            });

            if (!debt) return { success: false, message: 'Debt not found' };
            if (debt.lifecycleStatus !== 'active') return { success: true }; // Already deleting/deleted

            // 1. Revert initial debt creation transaction(s)
            const linkedTransactions = await ctx.db.query.transactions.findMany({
                where: eq(transactions.debtId, input.id)
            });

            for (const tx of linkedTransactions) {
                const amount = Number(tx.amount);
                // Revert balance: Income -> subtract, Expense -> add
                const balanceChange = tx.type === 'income'
                    ? sql`${currencyBalances.balance} - ${amount}`
                    : sql`${currencyBalances.balance} + ${amount}`;

                await ctx.db.update(currencyBalances)
                    .set({
                        balance: balanceChange,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, tx.currencyBalanceId));

                // Mark transaction as deleting
                await ctx.db.update(transactions)
                    .set({ lifecycleStatus: 'deleting' })
                    .where(eq(transactions.id, tx.id));
            }

            // 2. Revert any payments made
            const payments = await ctx.db.query.debtPayments.findMany({
                where: eq(debtPayments.debtId, input.id)
            });

            for (const payment of payments) {
                const paymentTransactions = await ctx.db.query.transactions.findMany({
                    where: eq(transactions.debtPaymentId, payment.id)
                });

                for (const tx of paymentTransactions) {
                    const amount = Number(tx.amount);
                    const balanceChange = tx.type === 'income'
                        ? sql`${currencyBalances.balance} - ${amount}`
                        : sql`${currencyBalances.balance} + ${amount}`;

                    await ctx.db.update(currencyBalances)
                        .set({
                            balance: balanceChange,
                            updatedAt: new Date()
                        })
                        .where(eq(currencyBalances.id, tx.currencyBalanceId));

                    // Mark transaction as deleting
                    await ctx.db.update(transactions)
                        .set({ lifecycleStatus: 'deleting' })
                        .where(eq(transactions.id, tx.id));
                }
            }

            // 3. Mark Debt as Deleting
            await ctx.db.update(debts)
                .set({
                    lifecycleStatus: 'deleting',
                    updatedAt: new Date()
                })
                .where(eq(debts.id, input.id));

            return { success: true };
        }),

    undoDelete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const debt = await ctx.db.query.debts.findFirst({
                where: and(
                    eq(debts.id, input.id),
                    eq(debts.userId, ctx.userId!)
                )
            });

            if (!debt) return { success: false, message: 'Debt not found' };
            if (debt.lifecycleStatus !== 'deleting') return { success: true }; // Can only undo 'deleting'

            // 1. Restore initial debt creation transaction(s)
            const linkedTransactions = await ctx.db.query.transactions.findMany({
                where: eq(transactions.debtId, input.id)
            });

            for (const tx of linkedTransactions) {
                const amount = Number(tx.amount);
                // Restore balance: Income -> add, Expense -> subtract
                const balanceChange = tx.type === 'income'
                    ? sql`${currencyBalances.balance} + ${amount}`
                    : sql`${currencyBalances.balance} - ${amount}`;

                await ctx.db.update(currencyBalances)
                    .set({
                        balance: balanceChange,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, tx.currencyBalanceId));

                // Mark transaction as active
                await ctx.db.update(transactions)
                    .set({ lifecycleStatus: 'active' })
                    .where(eq(transactions.id, tx.id));
            }

            // 2. Restore any payments made
            const payments = await ctx.db.query.debtPayments.findMany({
                where: eq(debtPayments.debtId, input.id)
            });

            for (const payment of payments) {
                const paymentTransactions = await ctx.db.query.transactions.findMany({
                    where: eq(transactions.debtPaymentId, payment.id)
                });

                for (const tx of paymentTransactions) {
                    const amount = Number(tx.amount);
                    const balanceChange = tx.type === 'income'
                        ? sql`${currencyBalances.balance} + ${amount}`
                        : sql`${currencyBalances.balance} - ${amount}`;

                    await ctx.db.update(currencyBalances)
                        .set({
                            balance: balanceChange,
                            updatedAt: new Date()
                        })
                        .where(eq(currencyBalances.id, tx.currencyBalanceId));

                    // Mark transaction as active
                    await ctx.db.update(transactions)
                        .set({ lifecycleStatus: 'active' })
                        .where(eq(transactions.id, tx.id));
                }
            }

            // 3. Mark Debt as Active
            await ctx.db.update(debts)
                .set({
                    lifecycleStatus: 'active',
                    updatedAt: new Date()
                })
                .where(eq(debts.id, input.id));

            return { success: true };
        }),
});
