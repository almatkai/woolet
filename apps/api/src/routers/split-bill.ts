import { z } from 'zod';
import { eq, and, desc, inArray, sql, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import {
    splitParticipants,
    transactionSplits,
    splitPayments,
    transactions,
    currencyBalances,
    categories,
    banks,
    accounts,
} from '../db/schema';
import {
    createSplitParticipantSchema,
    updateSplitParticipantSchema,
    createTransactionSplitsSchema,
    updateTransactionSplitSchema,
    recordSplitPaymentSchema,
    settleSplitSchema,
    getSplitsQuerySchema,
    getPendingSplitsQuerySchema,
} from '@woolet/shared';

export const splitBillRouter = router({
    // ==========================================
    // PARTICIPANT MANAGEMENT
    // ==========================================

    // List all participants for the user
    listParticipants: protectedProcedure
        .input(z.object({
            includeInactive: z.boolean().default(false),
        }).optional())
        .query(async ({ ctx, input }) => {
            const conditions = [eq(splitParticipants.userId, ctx.userId!)];
            
            if (!input?.includeInactive) {
                conditions.push(eq(splitParticipants.isActive, true));
            }

            const participants = await ctx.db.query.splitParticipants.findMany({
                where: and(...conditions),
                orderBy: [desc(splitParticipants.createdAt)],
            });

            return participants;
        }),

    // Get all pending splits (people who owe the user money)
    getPendingSplits: protectedProcedure
        .input(z.object({
            status: z.enum(['pending', 'partial', 'settled']).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
            // Get all splits for transactions where the participant belongs to the user
            const splits = await ctx.db.query.transactionSplits.findMany({
                where: (table, { and, exists, eq, inArray }) => and(
                    input?.status 
                        ? eq(table.status, input.status)
                        : inArray(table.status, ['pending', 'partial']),
                    exists(
                        ctx.db.select()
                            .from(splitParticipants)
                            .where(and(
                                eq(splitParticipants.id, table.participantId),
                                eq(splitParticipants.userId, ctx.userId!)
                            ))
                    )
                ),
                orderBy: [desc(transactionSplits.createdAt)],
                with: {
                    participant: true,
                    transaction: {
                        with: {
                            currencyBalance: {
                                with: {
                                    account: {
                                        with: {
                                            bank: true,
                                        },
                                    },
                                    currency: true,
                                },
                            },
                            category: true,
                        },
                    },
                    payments: {
                        orderBy: [desc(splitPayments.paidAt)],
                    },
                },
            });

            return splits;
        }),

    // Get summary of who owes how much
    getOwedSummary: protectedProcedure
        .query(async ({ ctx }) => {
            const participants = await ctx.db.query.splitParticipants.findMany({
                where: eq(splitParticipants.userId, ctx.userId!),
            });

            if (participants.length === 0) {
                return { total: 0, byParticipant: [] };
            }

            const participantIds = participants.map(p => p.id);

            const splits = await ctx.db.query.transactionSplits.findMany({
                where: and(
                    inArray(transactionSplits.participantId, participantIds),
                    ne(transactionSplits.status, 'settled')
                ),
                with: {
                    participant: true,
                }
            });

            const summaryByParticipant: Record<string, {
                participant: any;
                totalOwed: number;
                totalPaid: number;
                remaining: number;
            }> = {};

            let totalOwedToUser = 0;

            for (const split of splits) {
                const pId = split.participantId;
                const owed = Number(split.owedAmount);
                const paid = Number(split.paidAmount);
                const remaining = owed - paid;

                if (!summaryByParticipant[pId]) {
                    summaryByParticipant[pId] = {
                        participant: split.participant,
                        totalOwed: 0,
                        totalPaid: 0,
                        remaining: 0,
                    };
                }

                summaryByParticipant[pId].totalOwed += owed;
                summaryByParticipant[pId].totalPaid += paid;
                summaryByParticipant[pId].remaining += remaining;
                totalOwedToUser += remaining;
            }

            return {
                total: totalOwedToUser,
                byParticipant: Object.values(summaryByParticipant).sort((a, b) => b.remaining - a.remaining),
            };
        }),

    // Create a new participant
    createParticipant: protectedProcedure
        .input(createSplitParticipantSchema)
        .mutation(async ({ ctx, input }) => {
            const [participant] = await ctx.db.insert(splitParticipants).values({
                userId: ctx.userId!,
                name: input.name,
                contactType: input.contactType,
                contactValue: input.contactValue,
                color: input.color || '#8b5cf6',
            }).returning();

            return participant;
        }),

    // Update a participant
    updateParticipant: protectedProcedure
        .input(updateSplitParticipantSchema)
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const existing = await ctx.db.query.splitParticipants.findFirst({
                where: and(
                    eq(splitParticipants.id, input.id),
                    eq(splitParticipants.userId, ctx.userId!)
                ),
            });

            if (!existing) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Participant not found' });
            }

            const updateData: Partial<typeof splitParticipants.$inferInsert> = {
                updatedAt: new Date(),
            };

            if (input.name !== undefined) updateData.name = input.name;
            if (input.contactType !== undefined) updateData.contactType = input.contactType;
            if (input.contactValue !== undefined) updateData.contactValue = input.contactValue;
            if (input.color !== undefined) updateData.color = input.color;
            if (input.isActive !== undefined) updateData.isActive = input.isActive;

            const [updated] = await ctx.db
                .update(splitParticipants)
                .set(updateData)
                .where(eq(splitParticipants.id, input.id))
                .returning();

            return updated;
        }),

    // Delete (soft) a participant
    deleteParticipant: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const existing = await ctx.db.query.splitParticipants.findFirst({
                where: and(
                    eq(splitParticipants.id, input.id),
                    eq(splitParticipants.userId, ctx.userId!)
                ),
            });

            if (!existing) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Participant not found' });
            }

            // Soft delete
            await ctx.db
                .update(splitParticipants)
                .set({ isActive: false, updatedAt: new Date() })
                .where(eq(splitParticipants.id, input.id));

            return { success: true };
        }),

    // ==========================================
    // TRANSACTION SPLITS
    // ==========================================

    // Create splits for a transaction
    createSplits: protectedProcedure
        .input(createTransactionSplitsSchema)
        .mutation(async ({ ctx, input }) => {
            // Verify transaction ownership
            const transaction = await ctx.db.query.transactions.findFirst({
                where: eq(transactions.id, input.transactionId),
                with: {
                    currencyBalance: {
                        with: {
                            account: {
                                with: {
                                    bank: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!transaction || transaction.currencyBalance.account.bank.userId !== ctx.userId!) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
            }

            // Verify all participants belong to user
            const participantIds = input.splits.map(s => s.participantId);
            const participants = await ctx.db.query.splitParticipants.findMany({
                where: and(
                    inArray(splitParticipants.id, participantIds),
                    eq(splitParticipants.userId, ctx.userId!)
                ),
            });

            if (participants.length !== participantIds.length) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more participants not found' });
            }

            let splitsToCreate = input.splits;

            // If equal split, calculate amounts
            if (input.equalSplit) {
                const totalAmount = input.totalAmount || Math.abs(Number(transaction.amount));
                const perPersonAmount = totalAmount / input.splits.length;

                splitsToCreate = input.splits.map(s => ({
                    ...s,
                    owedAmount: Math.round(perPersonAmount * 100) / 100, // Round to 2 decimal places
                }));
            }

            // Delete existing splits for this transaction
            await ctx.db.delete(transactionSplits).where(
                eq(transactionSplits.transactionId, input.transactionId)
            );

            // Create new splits
            const createdSplits = await ctx.db.insert(transactionSplits).values(
                splitsToCreate.map(s => ({
                    transactionId: input.transactionId,
                    participantId: s.participantId,
                    owedAmount: String(s.owedAmount),
                    note: s.note,
                }))
            ).returning();

            return createdSplits;
        }),

    // Get splits for a transaction
    getTransactionSplits: protectedProcedure
        .input(z.object({ transactionId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Verify transaction ownership first
            const transaction = await ctx.db.query.transactions.findFirst({
                where: eq(transactions.id, input.transactionId),
                with: {
                    currencyBalance: {
                        with: {
                            account: {
                                with: {
                                    bank: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!transaction || transaction.currencyBalance.account.bank.userId !== ctx.userId!) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
            }

            const splits = await ctx.db.query.transactionSplits.findMany({
                where: eq(transactionSplits.transactionId, input.transactionId),
                with: {
                    participant: true,
                    payments: true,
                },
            });

            return splits;
        }),

    // Update a split
    updateSplit: protectedProcedure
        .input(updateTransactionSplitSchema)
        .mutation(async ({ ctx, input }) => {
            // Verify split ownership via transaction
            const split = await ctx.db.query.transactionSplits.findFirst({
                where: eq(transactionSplits.id, input.id),
                with: {
                    transaction: {
                        with: {
                            currencyBalance: {
                                with: {
                                    account: {
                                        with: {
                                            bank: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!split || split.transaction.currencyBalance.account.bank.userId !== ctx.userId!) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split not found' });
            }

            const updateData: Partial<typeof transactionSplits.$inferInsert> = {
                updatedAt: new Date(),
            };

            if (input.owedAmount !== undefined) updateData.owedAmount = String(input.owedAmount);
            if (input.note !== undefined) updateData.note = input.note;

            const [updated] = await ctx.db
                .update(transactionSplits)
                .set(updateData)
                .where(eq(transactionSplits.id, input.id))
                .returning();

            return updated;
        }),

    // Delete a split
    deleteSplit: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const split = await ctx.db.query.transactionSplits.findFirst({
                where: eq(transactionSplits.id, input.id),
                with: {
                    transaction: {
                        with: {
                            currencyBalance: {
                                with: {
                                    account: {
                                        with: {
                                            bank: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!split || split.transaction.currencyBalance.account.bank.userId !== ctx.userId!) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split not found' });
            }

            await ctx.db.delete(transactionSplits).where(eq(transactionSplits.id, input.id));

            return { success: true };
        }),

    // ==========================================
    // PAYMENTS
    // ==========================================

    // Record a payment for a split
    recordPayment: protectedProcedure
        .input(recordSplitPaymentSchema)
        .mutation(async ({ ctx, input }) => {
            // Verify split ownership
            const split = await ctx.db.query.transactionSplits.findFirst({
                where: eq(transactionSplits.id, input.splitId),
                with: {
                    participant: true,
                    transaction: {
                        with: {
                            currencyBalance: {
                                with: {
                                    account: {
                                        with: {
                                            bank: true,
                                        },
                                    },
                                    currency: true,
                                },
                            },
                            category: true,
                        },
                    },
                },
            });

            if (!split || split.transaction.currencyBalance.account.bank.userId !== ctx.userId!) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split not found' });
            }

            const owedAmount = Number(split.owedAmount);
            const currentPaid = Number(split.paidAmount);
            const newPaidTotal = currentPaid + input.amount;

            if (newPaidTotal > owedAmount) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Payment amount exceeds remaining balance. Owed: ${owedAmount}, Already paid: ${currentPaid}`,
                });
            }

            // Determine new status
            const newStatus = newPaidTotal >= owedAmount ? 'settled' : 'partial';

            let linkedTransactionId: string | undefined;

            // Optionally create an income transaction
            if (input.createIncomeTransaction && input.receivedToCurrencyBalanceId) {
                // Find or create a "Split Payment Received" category
                let splitCategory = await ctx.db.query.categories.findFirst({
                    where: and(
                        eq(categories.userId, ctx.userId!),
                        eq(categories.name, 'Split Payment')
                    ),
                });

                if (!splitCategory) {
                    [splitCategory] = await ctx.db.insert(categories).values({
                        userId: ctx.userId!,
                        name: 'Split Payment',
                        icon: '💰',
                        color: '#10b981',
                        type: 'income',
                    }).returning();
                }

                // Create income transaction
                const [incomeTransaction] = await ctx.db.insert(transactions).values({
                    currencyBalanceId: input.receivedToCurrencyBalanceId,
                    categoryId: splitCategory.id,
                    amount: String(input.amount),
                    type: 'income',
                    date: input.date || new Date().toISOString().split('T')[0],
                    description: `Split payment from ${split.participant.name}`,
                }).returning();

                linkedTransactionId = incomeTransaction.id;

                // Update the balance
                const targetBalance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.receivedToCurrencyBalanceId),
                });

                if (targetBalance) {
                    await ctx.db
                        .update(currencyBalances)
                        .set({
                            balance: String(Number(targetBalance.balance) + input.amount),
                            updatedAt: new Date(),
                        })
                        .where(eq(currencyBalances.id, input.receivedToCurrencyBalanceId));
                }
            }

            // Record the payment
            const [payment] = await ctx.db.insert(splitPayments).values({
                splitId: input.splitId,
                amount: String(input.amount),
                receivedToCurrencyBalanceId: input.receivedToCurrencyBalanceId,
                linkedTransactionId,
                note: input.note,
            }).returning();

            // Update the split
            await ctx.db
                .update(transactionSplits)
                .set({
                    paidAmount: String(newPaidTotal),
                    status: newStatus,
                    updatedAt: new Date(),
                })
                .where(eq(transactionSplits.id, input.splitId));

            return payment;
        }),

    // Settle a split completely (mark as fully paid)
    settleSplit: protectedProcedure
        .input(settleSplitSchema)
        .mutation(async ({ ctx, input }) => {
            // Verify split ownership
            const split = await ctx.db.query.transactionSplits.findFirst({
                where: eq(transactionSplits.id, input.splitId),
                with: {
                    participant: true,
                    transaction: {
                        with: {
                            currencyBalance: {
                                with: {
                                    account: {
                                        with: {
                                            bank: true,
                                        },
                                    },
                                    currency: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!split || split.transaction.currencyBalance.account.bank.userId !== ctx.userId!) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split not found' });
            }

            const remainingAmount = Number(split.owedAmount) - Number(split.paidAmount);

            if (remainingAmount <= 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Split is already settled' });
            }

            let linkedTransactionId: string | undefined;

            // Optionally create an income transaction
            if (input.createIncomeTransaction && input.receivedToCurrencyBalanceId) {
                // Find or create a "Split Payment Received" category
                let splitCategory = await ctx.db.query.categories.findFirst({
                    where: and(
                        eq(categories.userId, ctx.userId!),
                        eq(categories.name, 'Split Payment')
                    ),
                });

                if (!splitCategory) {
                    [splitCategory] = await ctx.db.insert(categories).values({
                        userId: ctx.userId!,
                        name: 'Split Payment',
                        icon: '💰',
                        color: '#10b981',
                        type: 'income',
                    }).returning();
                }

                // Create income transaction
                const [incomeTransaction] = await ctx.db.insert(transactions).values({
                    currencyBalanceId: input.receivedToCurrencyBalanceId,
                    categoryId: splitCategory.id,
                    amount: String(remainingAmount),
                    type: 'income',
                    date: new Date().toISOString().split('T')[0],
                    description: `Split payment from ${split.participant.name} (settled)`,
                }).returning();

                linkedTransactionId = incomeTransaction.id;

                // Update the balance
                const targetBalance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.receivedToCurrencyBalanceId),
                });

                if (targetBalance) {
                    await ctx.db
                        .update(currencyBalances)
                        .set({
                            balance: String(Number(targetBalance.balance) + remainingAmount),
                            updatedAt: new Date(),
                        })
                        .where(eq(currencyBalances.id, input.receivedToCurrencyBalanceId));
                }
            }

            // Record the final payment
            const [payment] = await ctx.db.insert(splitPayments).values({
                splitId: input.splitId,
                amount: String(remainingAmount),
                receivedToCurrencyBalanceId: input.receivedToCurrencyBalanceId,
                linkedTransactionId,
                note: input.note || 'Settled',
            }).returning();

            // Update the split to settled
            await ctx.db
                .update(transactionSplits)
                .set({
                    paidAmount: split.owedAmount, // Full amount paid
                    status: 'settled',
                    updatedAt: new Date(),
                })
                .where(eq(transactionSplits.id, input.splitId));

            return payment;
        }),

});
