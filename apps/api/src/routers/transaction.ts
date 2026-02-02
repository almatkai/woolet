import { z } from 'zod';
import { eq, desc, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { transactions, currencyBalances, categories, banks, accounts, transactionSplits, splitParticipants, splitPayments } from '../db/schema';
import { checkEntityLimit } from '../lib/limits';
import { quickSplitSchema } from '@woolet/shared';

export const transactionRouter = router({
    list: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(100).default(50),
            cursor: z.string().nullish(), // For pagination
            type: z.enum(['income', 'expense', 'transfer']).optional(),
            startDate: z.string().datetime().optional(),
            endDate: z.string().datetime().optional(),
            currencyBalanceId: z.string().uuid().optional(),
            excludeFromStats: z.boolean().optional(),
            hideAdjustments: z.boolean().optional(),
            includeChildren: z.boolean().optional(),
        }))
        .query(async ({ ctx, input }) => {
            // Complex filtering
            // Need to filter transactions that belong to user's currency balances
            // We can verify ownership by joining currencyBalances -> accounts -> banks -> userId

            // For simplicity in list query, we might rely on UI sending valid IDs
            // But strict security means filtering by user ownership

            // Let's filter by conditions first
            const conditions = [];

            // Fetch allowed currencyBalanceIds based on testMode
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
            const allowedBalanceIds = userBanks.flatMap(b => b.accounts.flatMap(a => a.currencyBalances.map(cb => cb.id)));

            if (allowedBalanceIds.length === 0) {
                return { transactions: [] };
            }
            conditions.push(inArray(transactions.currencyBalanceId, allowedBalanceIds));

            if (input.type) conditions.push(eq(transactions.type, input.type));
            if (input.startDate) conditions.push(gte(transactions.date, input.startDate.split('T')[0]));
            if (input.endDate) conditions.push(lte(transactions.date, input.endDate.split('T')[0]));
            if (input.currencyBalanceId) conditions.push(eq(transactions.currencyBalanceId, input.currencyBalanceId));
            if (input.excludeFromStats !== undefined) conditions.push(eq(transactions.excludeFromMonthlyStats, input.excludeFromStats));
            // Show only main transactions by default (exclude child paybacks from main list to avoid clutter)
            if (!input.includeChildren) {
                conditions.push(sql`${transactions.parentTransactionId} IS NULL`);
            }
            // Hide transactions marked as deleting (e.g., soft-deleted debts/payments)
            conditions.push(eq(transactions.lifecycleStatus, 'active'));
            // Filter out manual adjustments if requested
            if (input.hideAdjustments) {
                // Not equal to 'Balance manual adjustment'
                // Drizzle `ne` (not equal)
                conditions.push(sql`${transactions.description} != 'Balance manual adjustment'`);
            }

            const items = await ctx.db.query.transactions.findMany({
                where: conditions.length ? and(...conditions) : undefined,
                limit: input.limit,
                orderBy: [desc(transactions.date), desc(transactions.createdAt)],
                with: {
                    category: true,
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
                    splits: {
                        with: {
                            participant: true,
                        },
                    },
                    childTransactions: {
                        with: {
                            category: true,
                            currencyBalance: {
                                with: {
                                    account: {
                                        with: {
                                            bank: true
                                        }
                                    },
                                    currency: true
                                }
                            }
                        }
                    }
                }
            });

            // Filter for user ownership in memory or add join condition
            // In-memory filter for safety (quickest valid impl):
            // const safeItems = items.filter(i => i.currencyBalance.account.bank.userId === ctx.userId)
            // ^ requires deep fetch.

            // For MVP, assuming the user can only see what they query if we scoped correctly
            // A meaningful scope would be "transactions where currency_balance.account.bank.userId = current_user"
            // Drizzle query builder allows specific where clause but deep relations are tricky to filter top-level.

            // Let's trust the FE sends valid queries for now, and protect mutations strictly
            // Or better: fetch all user's currencyBalanceIds first

            return { transactions: items };
        }),

    create: protectedProcedure
        .input(z.object({
            currencyBalanceId: z.string().uuid(),
            categoryId: z.string().uuid().optional(), // optional for transfers?
            amount: z.number().positive(), // Backend uses string(decimal) but input validates number
            type: z.enum(['income', 'expense', 'transfer']),
            date: z.string(), // ISO date
            description: z.string().optional(),

            // For transfers
            toCurrencyBalanceId: z.string().uuid().optional(),
            fee: z.number().optional(),
            exchangeRate: z.number().optional(),
            cashbackAmount: z.number().min(0).optional(),

            // For split bills (Option 2: tag people on transaction)
            split: quickSplitSchema.optional(),
            parentTransactionId: z.string().uuid().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Check test mode limits
            await checkEntityLimit(ctx.db, ctx.userId!, 'transactions');

            // Check balance for expense/transfer
            const currentBalance = await ctx.db.query.currencyBalances.findFirst({
                where: eq(currencyBalances.id, input.currencyBalanceId),
                with: {
                    account: {
                        with: {
                            bank: true
                        }
                    }
                }
            });

            if (!currentBalance) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Account balance not found' });
            }

            if (currentBalance.account.bank.isTest !== ctx.user.testMode) {
                throw new TRPCError({ code: 'FORBIDDEN', message: `Cannot create transaction in ${currentBalance.account.bank.isTest ? 'Test' : 'Production'} account while in ${ctx.user.testMode ? 'Test' : 'Production'} Mode.` });
            }

            const amount = Number(input.amount);
            const currentAmount = Number(currentBalance.balance);

            if (input.type === 'expense' || input.type === 'transfer') {
                const requiredAmount = amount + (input.fee || 0);
                if (currentAmount < requiredAmount) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Insufficient funds. Available: ${currentAmount}, Required: ${requiredAmount}`
                    });
                }
            }

            // Find or create 'Transfer' category if not provided
            let categoryId = input.categoryId;
            if (!categoryId && input.type === 'transfer') {
                let transferCategory = await ctx.db.query.categories.findFirst({
                    where: (c, { ilike }) => ilike(c.name, 'Transfer')
                });

                if (!transferCategory) {
                    const [newCat] = await ctx.db.insert(categories).values({
                        name: 'Transfer',
                        icon: '↔️',
                        color: '#3b82f6',
                        userId: ctx.userId, // Optional if we want user-specific
                    }).returning();
                    transferCategory = newCat;
                }
                categoryId = transferCategory.id;
            }

            // Fallback for other types if no category provided (should be required ideally)
            if (!categoryId) {
                // Try to find any default category or 'Other'
                const defaultCat = await ctx.db.query.categories.findFirst({
                    where: (c, { ilike }) => ilike(c.name, 'Other')
                });
                if (defaultCat) {
                    categoryId = defaultCat.id;
                } else {
                    // Create 'Other'
                    const [newCat] = await ctx.db.insert(categories).values({
                        name: 'Other',
                        icon: '📦',
                        color: '#94a3b8',
                        userId: ctx.userId
                    }).returning();
                    categoryId = newCat.id;
                }
            }

            const [transaction] = await ctx.db.insert(transactions).values({
                currencyBalanceId: input.currencyBalanceId,
                categoryId: categoryId,
                amount: input.amount.toString(),
                type: input.type,
                date: input.date.split('T')[0],
                description: input.description,
                toCurrencyBalanceId: input.toCurrencyBalanceId,
                parentTransactionId: input.parentTransactionId,
                fee: input.fee?.toString(),
                exchangeRate: input.exchangeRate?.toString(),
                cashbackAmount: input.cashbackAmount?.toString(),
            }).returning();

            // Handle split bills if participants are provided
            if (input.split && input.split.participantIds.length > 0) {
                // Verify all participants belong to user
                const participants = await ctx.db.query.splitParticipants.findMany({
                    where: and(
                        inArray(splitParticipants.id, input.split.participantIds),
                        eq(splitParticipants.userId, ctx.userId!)
                    ),
                });

                if (participants.length !== input.split.participantIds.length) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more participants not found' });
                }

                // Calculate split amounts
                let splitAmounts: { participantId: string; amount: number }[] = [];

                if (input.split.equalSplit) {
                    // Equal split
                    const totalParticipants = input.split.includeSelf
                        ? input.split.participantIds.length + 1  // +1 for self
                        : input.split.participantIds.length;
                    const perPersonAmount = amount / totalParticipants;

                    splitAmounts = input.split.participantIds.map(id => {
                        const override = input.split.amounts?.find(a => a.participantId === id);
                        return {
                            participantId: id,
                            amount: Math.round(perPersonAmount * 100) / 100,
                            paybackCurrencyBalanceId: override?.paybackCurrencyBalanceId
                        };
                    });
                } else if (input.split.amounts) {
                    // Custom amounts
                    splitAmounts = input.split.amounts.map(a => ({
                        participantId: a.participantId,
                        amount: a.amount,
                        paybackCurrencyBalanceId: a.paybackCurrencyBalanceId
                    }));
                }

                // Create splits
                if (splitAmounts.length > 0) {
                    const createdSplits = await ctx.db.insert(transactionSplits).values(
                        splitAmounts.map(s => {
                            const participantSetting = input.split?.amounts?.find(a => a.participantId === s.participantId);
                            const paybackBalanceId = participantSetting?.paybackCurrencyBalanceId || input.split?.paybackCurrencyBalanceId;
                            
                            // Only set as settled if we actually have an account to receive money
                            const isInstantlyPaid = input.split?.instantMoneyBack && paybackBalanceId && paybackBalanceId !== '';
                            
                            return {
                                transactionId: transaction.id,
                                participantId: s.participantId,
                                owedAmount: String(s.amount),
                                status: isInstantlyPaid ? ('settled' as const) : ('pending' as const),
                                paidAmount: isInstantlyPaid ? String(s.amount) : '0',
                            };
                        })
                    ).returning();

                    // Handle instant money back
                    if (input.split.instantMoneyBack) {
                        for (const split of createdSplits) {
                            // Find if there is a specific account for this participant
                            const participantSetting = input.split.amounts?.find(a => a.participantId === split.participantId);
                            const paybackBalanceId = participantSetting?.paybackCurrencyBalanceId || input.split.paybackCurrencyBalanceId;

                            if (!paybackBalanceId || paybackBalanceId === '') continue;

                            // 1. Create income transaction for payback
                            const [paybackTx] = await ctx.db.insert(transactions).values({
                                currencyBalanceId: paybackBalanceId,
                                categoryId: transaction.categoryId, // Same category to net out
                                amount: split.owedAmount,
                                type: 'income',
                                date: transaction.date,
                                description: `Payback from ${participants.find(p => p.id === split.participantId)?.name || 'friend'} for ${transaction.description || 'split bill'}`,
                                parentTransactionId: transaction.id, // Linking here
                            }).returning();

                            // 2. Create split payment record
                            await ctx.db.insert(splitPayments).values({
                                splitId: split.id,
                                amount: split.owedAmount,
                                receivedToCurrencyBalanceId: paybackBalanceId,
                                linkedTransactionId: paybackTx.id,
                                paidAt: new Date(),
                            });

                            // 3. Update the payback account balance
                            const paybackBalance = await ctx.db.query.currencyBalances.findFirst({
                                where: eq(currencyBalances.id, paybackBalanceId),
                            });

                            if (paybackBalance) {
                                await ctx.db.update(currencyBalances)
                                    .set({ balance: (Number(paybackBalance.balance) + Number(split.owedAmount)).toString() })
                                    .where(eq(currencyBalances.id, paybackBalanceId));
                            }
                        }
                    }
                }
            }

            // Update balance
            const cashback = input.cashbackAmount || 0;

            if (input.type === 'income') {
                await ctx.db.update(currencyBalances)
                    .set({ balance: (currentAmount + amount).toString() })
                    .where(eq(currencyBalances.id, input.currencyBalanceId));
            } else if (input.type === 'expense') {
                // Deduct amount, add cashback back (net deduction = amount - cashback)
                // Or: balance - amount + cashback
                await ctx.db.update(currencyBalances)
                    .set({ balance: (currentAmount - amount + cashback).toString() })
                    .where(eq(currencyBalances.id, input.currencyBalanceId));
            } else if (input.type === 'transfer' && input.toCurrencyBalanceId) {
                // Deduct from source
                // Include fee if any? Assuming fee is separate or included in amount?
                // Usually fee is deducted on top of amount or inside. Let's assume amount includes everything sent,
                // or fee is extra. Schema says 'fee' is separate column.
                // Let's deduct amount + fee from source
                const fee = input.fee || 0;
                await ctx.db.update(currencyBalances)
                    .set({ balance: (currentAmount - amount - fee).toString() })
                    .where(eq(currencyBalances.id, input.currencyBalanceId));

                // Add to target
                const targetBalance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.toCurrencyBalanceId),
                });

                if (targetBalance) {
                    const rate = input.exchangeRate || 1;
                    const amountReceived = amount * rate;
                    // TODO: Ideally store `toAmount` in transaction for precision
                    await ctx.db.update(currencyBalances)
                        .set({ balance: (Number(targetBalance.balance) + amountReceived).toString() })
                        .where(eq(currencyBalances.id, input.toCurrencyBalanceId));
                }
            }

            return transaction;
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            description: z.string().optional(),
            date: z.string().optional(),
            categoryId: z.string().uuid().optional(),
            amount: z.number().optional(),
            currencyBalanceId: z.string().uuid().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const transaction = await ctx.db.query.transactions.findFirst({
                where: eq(transactions.id, input.id),
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
            });

            if (!transaction) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
            }

            if (transaction.currencyBalance.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to update this transaction' });
            }

            const updates: any = {};
            if (input.description !== undefined) updates.description = input.description;
            if (input.date !== undefined) updates.date = input.date.split('T')[0];
            if (input.categoryId !== undefined) updates.categoryId = input.categoryId;

            // Handle amount and account change
            const oldAmount = Number(transaction.amount);
            const newAmount = input.amount !== undefined ? input.amount : oldAmount;
            const oldBalanceId = transaction.currencyBalanceId;
            const newBalanceId = input.currencyBalanceId !== undefined ? input.currencyBalanceId : oldBalanceId;

            if (oldAmount !== newAmount || oldBalanceId !== newBalanceId) {
                // If moving to a new account, verify ownership
                if (newBalanceId !== oldBalanceId) {
                    const newBalance = await ctx.db.query.currencyBalances.findFirst({
                        where: eq(currencyBalances.id, newBalanceId),
                        with: {
                            account: {
                                with: {
                                    bank: true
                                }
                            }
                        }
                    });
                    if (!newBalance || newBalance.account.bank.userId !== ctx.userId) {
                        throw new TRPCError({ code: 'FORBIDDEN', message: 'Target account not found or access denied' });
                    }
                }

                // Only handle income and expense for now
                if (transaction.type === 'income') {
                    // Revert old from old
                    await ctx.db.update(currencyBalances)
                        .set({ balance: sql`${currencyBalances.balance} - ${oldAmount}` })
                        .where(eq(currencyBalances.id, oldBalanceId));
                    // Apply new to new
                    await ctx.db.update(currencyBalances)
                        .set({ balance: sql`${currencyBalances.balance} + ${newAmount}` })
                        .where(eq(currencyBalances.id, newBalanceId));
                } else if (transaction.type === 'expense') {
                    // Revert old from old
                    await ctx.db.update(currencyBalances)
                        .set({ balance: sql`${currencyBalances.balance} + ${oldAmount}` })
                        .where(eq(currencyBalances.id, oldBalanceId));
                    // Apply new to new
                    await ctx.db.update(currencyBalances)
                        .set({ balance: sql`${currencyBalances.balance} - ${newAmount}` })
                        .where(eq(currencyBalances.id, newBalanceId));
                }
                
                updates.amount = newAmount.toString();
                updates.currencyBalanceId = newBalanceId;
            }

            if (Object.keys(updates).length > 0) {
                await ctx.db.update(transactions)
                    .set({
                        ...updates,
                        updatedAt: new Date(),
                    })
                    .where(eq(transactions.id, input.id));
            }

            return { success: true };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Get transaction to rollback balance
            const transaction = await ctx.db.query.transactions.findFirst({
                where: eq(transactions.id, input.id)
            });

            if (!transaction) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
            }

            const amount = Number(transaction.amount);
            const fee = Number(transaction.fee || 0);
            const cashback = Number(transaction.cashbackAmount || 0);

            // Revert Balance
            if (transaction.type === 'income') {
                // Was income (+), so subtract
                await ctx.db.update(currencyBalances)
                    .set({
                        balance: sql`${currencyBalances.balance} - ${amount}`,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, transaction.currencyBalanceId));
            } else if (transaction.type === 'expense') {
                // Was expense (-), so add back. Also subtract cashback if any.
                // Net change was -(amount - cashback). Revert is +(amount - cashback)
                await ctx.db.update(currencyBalances)
                    .set({
                        balance: sql`${currencyBalances.balance} + ${amount} - ${cashback}`,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, transaction.currencyBalanceId));
            } else if (transaction.type === 'transfer') {
                // Was transfer (-amount -fee from source, +amount*rate to target)

                // Revert source: +amount + fee
                await ctx.db.update(currencyBalances)
                    .set({
                        balance: sql`${currencyBalances.balance} + ${amount} + ${fee}`,
                        updatedAt: new Date()
                    })
                    .where(eq(currencyBalances.id, transaction.currencyBalanceId));

                // Revert target: -amount*rate
                if (transaction.toCurrencyBalanceId) {
                    const rate = Number(transaction.exchangeRate || 1);
                    const amountReceived = amount * rate;
                    await ctx.db.update(currencyBalances)
                        .set({
                            balance: sql`${currencyBalances.balance} - ${amountReceived}`,
                            updatedAt: new Date()
                        })
                        .where(eq(currencyBalances.id, transaction.toCurrencyBalanceId));
                }
            }

            await ctx.db.delete(transactions).where(eq(transactions.id, input.id));
            return { success: true };
        }),

    getSpendingStats: protectedProcedure
        .input(z.object({
            startDate: z.string().datetime(),
            endDate: z.string().datetime(),
            categoryId: z.string().uuid().optional(), // Kept for backward compatibility if needed, but we will prefer categoryIds
            categoryIds: z.array(z.string().uuid()).optional(),
            currencyBalanceId: z.string().uuid().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const startDate = input.startDate.split('T')[0];
            const endDate = input.endDate.split('T')[0];

            // Fetch allowed currencyBalanceIds based on testMode
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
            const allowedBalanceIds = userBanks.flatMap(b => b.accounts.flatMap(a => a.currencyBalances.map(cb => cb.id)));

            if (allowedBalanceIds.length === 0) {
                return { timeSeriesData: [], categoryData: [], total: 0 };
            }

            // Step 1: Get all EXPENSE transactions in date range
            const expenseConditions = [
                eq(transactions.type, 'expense'),
                gte(transactions.date, startDate),
                lte(transactions.date, endDate),
                eq(transactions.excludeFromMonthlyStats, false),
                inArray(transactions.currencyBalanceId, allowedBalanceIds),
            ];

            if (input.categoryIds && input.categoryIds.length > 0) {
                expenseConditions.push(inArray(transactions.categoryId, input.categoryIds));
            }
            if (input.currencyBalanceId) {
                expenseConditions.push(eq(transactions.currencyBalanceId, input.currencyBalanceId));
            }

            const expenseTransactions = await ctx.db.query.transactions.findMany({
                where: and(...expenseConditions),
                with: {
                    category: true,
                    currencyBalance: true,
                    // Get child transactions (paybacks) linked to this expense
                    childTransactions: {
                        where: eq(transactions.type, 'income'),
                    },
                }
            });

            // Aggregate by Date (for Line/Bar Chart)
            const byDate: Record<string, number> = {};
            // Aggregate by Category (for Pie Chart)
            const byCategory: Record<string, { id: string, name: string, color: string, value: number }> = {};

            expenseTransactions.forEach(tx => {
                const expenseAmount = Number(tx.amount);
                const date = tx.date; // YYYY-MM-DD

                // Calculate paybacks for this expense
                let paybackTotal = 0;
                if (tx.childTransactions && tx.childTransactions.length > 0) {
                    tx.childTransactions.forEach(child => {
                        paybackTotal += Number(child.amount);
                    });
                }

                // Net spend = expense - paybacks
                const netAmount = expenseAmount - paybackTotal;

                // By Date
                byDate[date] = (byDate[date] || 0) + netAmount;

                // By Category
                if (tx.category) {
                    if (!byCategory[tx.categoryId]) {
                        byCategory[tx.categoryId] = {
                            id: tx.categoryId,
                            name: tx.category.name,
                            color: tx.category.color,
                            value: 0
                        };
                    }
                    byCategory[tx.categoryId].value += netAmount;
                }
            });

            // Convert to arrays
            const timeSeriesData = Object.entries(byDate)
                .map(([date, amount]) => ({ date, amount }))
                .sort((a, b) => a.date.localeCompare(b.date));

            const categoryData = Object.values(byCategory)
                .sort((a, b) => b.value - a.value);

            // Total is the sum of net spending across all processed transactions
            const total = Object.values(byDate).reduce((sum, amt) => sum + amt, 0);

            return {
                timeSeriesData,
                categoryData,
                total
            };
        }),
});
