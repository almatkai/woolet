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
    users,
    notifications,
    debts,
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
                with: {
                    linkedUser: {
                        columns: {
                            id: true,
                            name: true,
                            username: true,
                        },
                    },
                },
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

    // Get incoming split requests for the current user (linked by username)
    listIncomingRequests: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(100).default(20),
        }).optional())
        .query(async ({ ctx, input }) => {
            const myExpenseCategories = await ctx.db.query.categories.findMany({
                where: and(
                    eq(categories.userId, ctx.userId!),
                    eq(categories.type, 'expense')
                ),
                columns: {
                    name: true,
                },
            });
            const myExpenseCategoryNames = new Set(myExpenseCategories.map((c) => c.name.toLowerCase()));

            const items = await ctx.db.query.transactionSplits.findMany({
                where: (table, { and, exists, inArray, eq }) => and(
                    inArray(table.status, ['pending', 'partial']),
                    exists(
                        ctx.db.select()
                            .from(splitParticipants)
                            .where(and(
                                eq(splitParticipants.id, table.participantId),
                                eq(splitParticipants.linkedUserId, ctx.userId!),
                                eq(splitParticipants.isActive, true)
                            ))
                    )
                ),
                orderBy: [desc(transactionSplits.createdAt)],
                limit: input?.limit ?? 20,
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

            const ownerIds = Array.from(new Set(items.map((item) => item.participant.userId).filter(Boolean)));
            const owners = ownerIds.length > 0
                ? await ctx.db.select({
                    id: users.id,
                    name: users.name,
                    username: users.username,
                    testMode: users.testMode,
                    preferences: users.preferences,
                })
                    .from(users)
                    .where(inArray(users.id, ownerIds))
                : [];

            const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));

            const ownerReceivingAccounts = new Map<string, Array<{
                id: string;
                label: string;
                currencyCode: string;
            }>>();

            for (const owner of owners) {
                const allowAccountSharing = ((owner.preferences as any)?.splitBill?.allowAccountSharing) !== false;
                if (!allowAccountSharing) {
                    ownerReceivingAccounts.set(owner.id, []);
                    continue;
                }

                const ownerBanks = await ctx.db.query.banks.findMany({
                    where: and(
                        eq(banks.userId, owner.id),
                        eq(banks.isTest, owner.testMode)
                    ),
                    with: {
                        accounts: {
                            with: {
                                currencyBalances: true,
                            },
                        },
                    },
                });

                ownerReceivingAccounts.set(
                    owner.id,
                    ownerBanks.flatMap((bank) =>
                        bank.accounts.flatMap((account) =>
                            account.currencyBalances.map((balance) => ({
                                id: balance.id,
                                label: `[${bank.name}] ${account.name}`,
                                currencyCode: balance.currencyCode,
                            }))
                        )
                    )
                );
            }

            return items.map((item) => ({
                ...(function () {
                    const owner = ownerMap.get(item.participant.userId);
                    const allowAccountSharing = ((owner?.preferences as any)?.splitBill?.allowAccountSharing) !== false;
                    const receivingAccounts = (ownerReceivingAccounts.get(item.participant.userId) || [])
                        .filter((acc) => acc.currencyCode === item.transaction.currencyBalance.currencyCode);
                    const sourceCategory = item.transaction.category
                        ? {
                            id: item.transaction.category.id,
                            name: item.transaction.category.name,
                            type: item.transaction.category.type,
                            userId: item.transaction.category.userId,
                        }
                        : null;
                    const hasCategoryInMyList = sourceCategory
                        ? (
                            !sourceCategory.userId ||
                            sourceCategory.userId === ctx.userId ||
                            myExpenseCategoryNames.has(sourceCategory.name.toLowerCase())
                        )
                        : true;

                    return {
                        receivingAccountSharingEnabled: allowAccountSharing,
                        receivingAccounts,
                        sourceCategory,
                        hasCategoryInMyList,
                    };
                })(),
                ...item,
                fromUser: ownerMap.get(item.participant.userId) || null,
                remainingAmount: Number(item.owedAmount) - Number(item.paidAmount),
            }));
        }),

    // Import source category from incoming split if current user does not have it
    importIncomingSplitCategory: protectedProcedure
        .input(z.object({
            splitId: z.string().uuid(),
        }))
        .mutation(async ({ ctx, input }) => {
            const split = await ctx.db.query.transactionSplits.findFirst({
                where: eq(transactionSplits.id, input.splitId),
                with: {
                    participant: true,
                    transaction: {
                        with: {
                            category: true,
                        },
                    },
                },
            });

            if (!split) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split request not found' });
            }
            if (split.participant.linkedUserId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'This split request is not assigned to you' });
            }
            if (!split.transaction.category) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Source transaction has no category' });
            }

            const source = split.transaction.category;
            if (source.userId === null) {
                return { category: source, imported: false };
            }
            if (source.userId === ctx.userId) {
                return { category: source, imported: false };
            }

            const existing = await ctx.db.query.categories.findFirst({
                where: and(
                    eq(categories.userId, ctx.userId!),
                    eq(categories.type, source.type || 'expense'),
                    sql`lower(${categories.name}) = lower(${source.name})`
                ),
            });
            if (existing) {
                return { category: existing, imported: false };
            }

            const [created] = await ctx.db.insert(categories).values({
                userId: ctx.userId!,
                name: source.name,
                icon: source.icon,
                color: source.color,
                type: source.type || 'expense',
            }).returning();

            return { category: created, imported: true };
        }),

    // Incoming receipts that were paid by others but not assigned to an account yet
    listPendingIncomingReceipts: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(100).default(20),
        }).optional())
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db.query.splitPayments.findMany({
                where: (table, { and, isNull, exists, eq }) => and(
                    isNull(table.receivedToCurrencyBalanceId),
                    exists(
                        ctx.db.select()
                            .from(transactionSplits)
                            .where(and(
                                eq(transactionSplits.id, table.splitId),
                                exists(
                                    ctx.db.select()
                                        .from(splitParticipants)
                                        .where(and(
                                            eq(splitParticipants.id, transactionSplits.participantId),
                                            eq(splitParticipants.userId, ctx.userId!)
                                        ))
                                )
                            ))
                    )
                ),
                orderBy: [desc(splitPayments.paidAt)],
                limit: input?.limit ?? 20,
                with: {
                    split: {
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
                    },
                },
            });

            const fromUserIds = Array.from(new Set(rows.map((r) => r.split.participant.linkedUserId).filter(Boolean))) as string[];
            const fromUsers = fromUserIds.length > 0
                ? await ctx.db.select({
                    id: users.id,
                    name: users.name,
                    username: users.username,
                }).from(users).where(inArray(users.id, fromUserIds))
                : [];
            const fromUserMap = new Map(fromUsers.map((u) => [u.id, u]));

            return rows.map((row) => ({
                paymentId: row.id,
                splitId: row.splitId,
                amount: Number(row.amount),
                paidAt: row.paidAt,
                transactionId: row.split.transactionId,
                transactionDescription: row.split.transaction.description || 'Split payment',
                currencyCode: row.split.transaction.currencyBalance.currencyCode,
                fromUser: row.split.participant.linkedUserId ? fromUserMap.get(row.split.participant.linkedUserId) || null : null,
                sourceCategory: row.split.transaction.category
                    ? {
                        id: row.split.transaction.category.id,
                        name: row.split.transaction.category.name,
                        type: row.split.transaction.category.type,
                        userId: row.split.transaction.category.userId,
                    }
                    : null,
            }));
        }),

    // Assign pending incoming receipt to one of my accounts
    assignIncomingReceipt: protectedProcedure
        .input(z.object({
            paymentId: z.string().uuid(),
            currencyBalanceId: z.string().uuid(),
        }))
        .mutation(async ({ ctx, input }) => {
            const payment = await ctx.db.query.splitPayments.findFirst({
                where: eq(splitPayments.id, input.paymentId),
                with: {
                    split: {
                        with: {
                            participant: true,
                            transaction: {
                                with: {
                                    currencyBalance: {
                                        with: {
                                            account: {
                                                with: { bank: true },
                                            },
                                        },
                                    },
                                    category: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!payment) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Pending receipt not found' });
            }
            if (payment.receivedToCurrencyBalanceId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Receipt is already assigned' });
            }
            if (payment.split.participant.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your receipt' });
            }

            const targetBalance = await ctx.db.query.currencyBalances.findFirst({
                where: eq(currencyBalances.id, input.currencyBalanceId),
                with: {
                    account: {
                        with: { bank: true },
                    },
                },
            });
            if (!targetBalance || targetBalance.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found' });
            }

            const incomingAmount = Number(payment.amount);
            if (targetBalance.currencyCode !== payment.split.transaction.currencyBalance.currencyCode) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Account currency must be ${payment.split.transaction.currencyBalance.currencyCode}`,
                });
            }

            let splitReceivedCategory = await ctx.db.query.categories.findFirst({
                where: and(
                    eq(categories.userId, ctx.userId!),
                    eq(categories.name, 'Split Payment')
                ),
            });
            if (!splitReceivedCategory) {
                [splitReceivedCategory] = await ctx.db.insert(categories).values({
                    userId: ctx.userId!,
                    name: 'Split Payment',
                    icon: '💰',
                    color: '#10b981',
                    type: 'income',
                }).returning();
            }

            const [incomeTx] = await ctx.db.insert(transactions).values({
                currencyBalanceId: targetBalance.id,
                categoryId: splitReceivedCategory.id,
                amount: String(incomingAmount),
                type: 'income',
                date: new Date().toISOString().split('T')[0],
                description: `Split payment received`,
            }).returning();

            await ctx.db.update(currencyBalances)
                .set({
                    balance: String(Number(targetBalance.balance) + incomingAmount),
                    updatedAt: new Date(),
                })
                .where(eq(currencyBalances.id, targetBalance.id));

            await ctx.db.update(splitPayments)
                .set({
                    receivedToCurrencyBalanceId: targetBalance.id,
                    linkedTransactionId: incomeTx.id,
                })
                .where(eq(splitPayments.id, payment.id));

            return { success: true, transactionId: incomeTx.id };
        }),

    // Respond to an incoming split request
    respondToIncomingRequest: protectedProcedure
        .input(z.object({
            splitId: z.string().uuid(),
            decision: z.enum(['approve', 'disapprove']),
            settlement: z.enum(['debt', 'instant_payment']).optional(),
            note: z.string().optional(),
            payerCurrencyBalanceId: z.string().uuid().optional(),
            receiverCurrencyBalanceId: z.string().uuid().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
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

            if (!split) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split request not found' });
            }

            if (split.participant.linkedUserId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'This split request is not assigned to you' });
            }

            if (split.status === 'settled') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'This split request is already settled' });
            }

            const remainingAmount = Number(split.owedAmount) - Number(split.paidAmount);
            if (remainingAmount <= 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nothing to settle for this split request' });
            }

            const [ownerUser, responderUser] = await Promise.all([
                ctx.db.query.users.findFirst({
                    where: eq(users.id, split.participant.userId),
                    columns: { id: true, name: true, username: true, testMode: true, preferences: true },
                }),
                ctx.db.query.users.findFirst({
                    where: eq(users.id, ctx.userId!),
                    columns: { id: true, name: true, username: true, testMode: true },
                }),
            ]);

            const responderLabel = responderUser?.name || responderUser?.username || 'Participant';
            const ownerLabel = ownerUser?.name || ownerUser?.username || 'Friend';
            const baseNote = input.note?.trim();

            if (input.decision === 'disapprove') {
                await ctx.db
                    .update(transactionSplits)
                    .set({
                        status: 'settled',
                        paidAmount: split.paidAmount,
                        note: [split.note, baseNote, `Disapproved by ${responderLabel}`].filter(Boolean).join(' | '),
                        updatedAt: new Date(),
                    })
                    .where(eq(transactionSplits.id, split.id));

                if (ownerUser?.id) {
                    await ctx.db.insert(notifications).values({
                        userId: ownerUser.id,
                        type: 'general',
                        title: 'Split request declined',
                        message: `${responderLabel} declined split for "${split.transaction.description || 'transaction'}".`,
                        priority: 'medium',
                        links: { web: '/spending', mobile: 'woolet://spending', universal: 'https://woolet.app/spending' },
                        entityType: 'transaction',
                        entityId: split.transactionId,
                        metadata: {
                            splitId: split.id,
                            decision: 'disapprove',
                            responderUserId: ctx.userId,
                        },
                    });
                }

                return { success: true, outcome: 'disapproved' as const };
            }

            const settlement = input.settlement || 'debt';

            if (settlement === 'instant_payment') {
                if (!input.payerCurrencyBalanceId) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Select the account you paid from' });
                }

                const splitCurrency = split.transaction.currencyBalance.currencyCode;

                const payerBalance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.payerCurrencyBalanceId),
                    with: {
                        account: {
                            with: {
                                bank: true,
                            },
                        },
                    },
                });

                if (!payerBalance || payerBalance.account.bank.userId !== ctx.userId) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'Payer account not found' });
                }

                if (payerBalance.currencyCode !== splitCurrency) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Payer account currency must be ${splitCurrency}`,
                    });
                }

                const payerCurrentBalance = Number(payerBalance.balance);
                if (payerCurrentBalance < remainingAmount) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Insufficient funds. Available: ${payerCurrentBalance}, Required: ${remainingAmount}`,
                    });
                }

                const ownerAccountSharingEnabled = ((ownerUser?.preferences as any)?.splitBill?.allowAccountSharing) !== false;
                let receiverBalance: any = null;
                if (input.receiverCurrencyBalanceId) {
                    if (!ownerAccountSharingEnabled) {
                        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Receiver disabled account sharing' });
                    }

                    receiverBalance = await ctx.db.query.currencyBalances.findFirst({
                        where: eq(currencyBalances.id, input.receiverCurrencyBalanceId),
                        with: {
                            account: {
                                with: {
                                    bank: true,
                                },
                            },
                        },
                    });

                    if (!receiverBalance || receiverBalance.account.bank.userId !== ownerUser?.id) {
                        throw new TRPCError({ code: 'FORBIDDEN', message: 'Receiver account not found' });
                    }

                    if (receiverBalance.currencyCode !== splitCurrency) {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: `Receiver account currency must be ${splitCurrency}`,
                        });
                    }
                }

                let splitPaymentTransactionCategory = await ctx.db.query.categories.findFirst({
                    where: and(
                        eq(categories.userId, ctx.userId!),
                        eq(categories.name, 'Split Payment Sent')
                    ),
                });

                if (!splitPaymentTransactionCategory) {
                    [splitPaymentTransactionCategory] = await ctx.db.insert(categories).values({
                        userId: ctx.userId!,
                        name: 'Split Payment Sent',
                        icon: '💸',
                        color: '#f97316',
                        type: 'expense',
                    }).returning();
                }

                const [payerTx] = await ctx.db.insert(transactions).values({
                    currencyBalanceId: input.payerCurrencyBalanceId,
                    categoryId: splitPaymentTransactionCategory.id,
                    amount: String(remainingAmount),
                    type: 'expense',
                    date: new Date().toISOString().split('T')[0],
                    description: `Instant split payment to ${ownerLabel}`,
                    parentTransactionId: split.transactionId,
                }).returning();

                await ctx.db.update(currencyBalances)
                    .set({
                        balance: String(payerCurrentBalance - remainingAmount),
                        updatedAt: new Date(),
                    })
                    .where(eq(currencyBalances.id, input.payerCurrencyBalanceId));

                let receivedTxId: string | undefined;
                if (receiverBalance) {
                    let splitReceivedCategory = await ctx.db.query.categories.findFirst({
                        where: and(
                            eq(categories.userId, ownerUser!.id),
                            eq(categories.name, 'Split Payment')
                        ),
                    });

                    if (!splitReceivedCategory) {
                        [splitReceivedCategory] = await ctx.db.insert(categories).values({
                            userId: ownerUser!.id,
                            name: 'Split Payment',
                            icon: '💰',
                            color: '#10b981',
                            type: 'income',
                        }).returning();
                    }

                    const [receivedTx] = await ctx.db.insert(transactions).values({
                        currencyBalanceId: receiverBalance.id,
                        categoryId: splitReceivedCategory.id,
                        amount: String(remainingAmount),
                        type: 'income',
                        date: new Date().toISOString().split('T')[0],
                        description: `Instant split payment from ${responderLabel}`,
                        parentTransactionId: split.transactionId,
                    }).returning();

                    receivedTxId = receivedTx.id;

                    await ctx.db.update(currencyBalances)
                        .set({
                            balance: String(Number(receiverBalance.balance) + remainingAmount),
                            updatedAt: new Date(),
                        })
                        .where(eq(currencyBalances.id, receiverBalance.id));
                }

                await ctx.db
                    .update(transactionSplits)
                    .set({
                        status: 'settled',
                        paidAmount: split.owedAmount,
                        note: [split.note, baseNote, `Approved by ${responderLabel} (instant)`].filter(Boolean).join(' | '),
                        updatedAt: new Date(),
                    })
                    .where(eq(transactionSplits.id, split.id));

                await ctx.db.insert(splitPayments).values({
                    splitId: split.id,
                    amount: String(remainingAmount),
                    receivedToCurrencyBalanceId: input.receiverCurrencyBalanceId || undefined,
                    linkedTransactionId: receivedTxId || payerTx.id,
                    note: baseNote || `Approved and settled instantly by ${responderLabel}`,
                    paidAt: new Date(),
                });

                if (ownerUser?.id) {
                    await ctx.db.insert(notifications).values({
                        userId: ownerUser.id,
                        type: 'general',
                        title: input.receiverCurrencyBalanceId ? 'Split approved and paid' : 'Split paid (account not selected)',
                        message: input.receiverCurrencyBalanceId
                            ? `${responderLabel} approved split and paid instantly.`
                            : `${responderLabel} paid instantly, but you need to assign where it was received.`,
                        priority: 'medium',
                        links: { web: input.receiverCurrencyBalanceId ? '/spending' : '/accounts', mobile: input.receiverCurrencyBalanceId ? 'woolet://spending' : 'woolet://accounts', universal: input.receiverCurrencyBalanceId ? 'https://woolet.app/spending' : 'https://woolet.app/accounts' },
                        entityType: 'transaction',
                        entityId: split.transactionId,
                        metadata: {
                            splitId: split.id,
                            decision: 'approve',
                            settlement: 'instant_payment',
                            responderUserId: ctx.userId,
                            receiverCurrencyBalanceId: input.receiverCurrencyBalanceId || null,
                        },
                    });
                }

                return { success: true, outcome: 'instant_payment' as const };
            }

            if (!ownerUser) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split owner not found' });
            }

            const currencyCode = split.transaction.currencyBalance.currencyCode;
            const splitDescription = split.transaction.description || 'Split bill';

            const [ownerDebt] = await ctx.db.insert(debts).values({
                userId: ownerUser.id,
                currencyCode,
                personName: responderLabel,
                amount: String(remainingAmount),
                paidAmount: '0',
                type: 'they_owe',
                description: `Split bill debt: ${splitDescription}`,
                status: 'pending',
                isTest: ownerUser.testMode,
            }).returning();

            const [responderDebt] = await ctx.db.insert(debts).values({
                userId: ctx.userId!,
                currencyCode,
                personName: ownerLabel,
                amount: String(remainingAmount),
                paidAmount: '0',
                type: 'i_owe',
                description: `Split bill debt: ${splitDescription}`,
                status: 'pending',
                isTest: responderUser?.testMode ?? false,
            }).returning();

            await ctx.db
                .update(transactionSplits)
                .set({
                    status: 'settled',
                    paidAmount: split.owedAmount,
                    note: [
                        split.note,
                        baseNote,
                        `Approved by ${responderLabel} (converted to debt: ${ownerDebt.id}/${responderDebt.id})`,
                    ].filter(Boolean).join(' | '),
                    updatedAt: new Date(),
                })
                .where(eq(transactionSplits.id, split.id));

            await ctx.db.insert(notifications).values([
                {
                    userId: ownerUser.id,
                    type: 'general',
                    title: 'Split approved as debt',
                    message: `${responderLabel} approved split. Debt has been created.`,
                    priority: 'medium',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt',
                    entityId: ownerDebt.id,
                    metadata: {
                        splitId: split.id,
                        decision: 'approve',
                        settlement: 'debt',
                        responderUserId: ctx.userId,
                    },
                },
                {
                    userId: ctx.userId!,
                    type: 'debt_reminder',
                    title: 'New split debt created',
                    message: `You now owe ${ownerLabel} ${remainingAmount.toFixed(2)} ${currencyCode}.`,
                    priority: 'medium',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt',
                    entityId: responderDebt.id,
                    metadata: {
                        splitId: split.id,
                        linkedOwnerDebtId: ownerDebt.id,
                    },
                },
            ]);

            return {
                success: true,
                outcome: 'debt' as const,
                debtIds: {
                    ownerDebtId: ownerDebt.id,
                    responderDebtId: responderDebt.id,
                },
            };
        }),

    // Pay an incoming split now (full or partial); partial remainder becomes debt
    payIncomingRequestNow: protectedProcedure
        .input(z.object({
            splitId: z.string().uuid(),
            amountNow: z.number().positive(),
            payerCurrencyBalanceId: z.string().uuid(),
            receiverCurrencyBalanceId: z.string().uuid().optional(),
            note: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
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

            if (!split) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split request not found' });
            }
            if (split.participant.linkedUserId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'This split request is not assigned to you' });
            }
            if (split.status === 'settled') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'This split request is already settled' });
            }

            const remainingAmount = Number(split.owedAmount) - Number(split.paidAmount);
            if (remainingAmount <= 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nothing to settle for this split request' });
            }
            if (input.amountNow > remainingAmount) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: `Amount exceeds remaining balance (${remainingAmount.toFixed(2)})` });
            }

            const [ownerUser, responderUser] = await Promise.all([
                ctx.db.query.users.findFirst({
                    where: eq(users.id, split.participant.userId),
                    columns: { id: true, name: true, username: true, testMode: true, preferences: true },
                }),
                ctx.db.query.users.findFirst({
                    where: eq(users.id, ctx.userId!),
                    columns: { id: true, name: true, username: true, testMode: true },
                }),
            ]);

            if (!ownerUser) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Split owner not found' });
            }

            const splitCurrency = split.transaction.currencyBalance.currencyCode;
            const responderLabel = responderUser?.name || responderUser?.username || 'Participant';
            const ownerLabel = ownerUser?.name || ownerUser?.username || 'Friend';
            const baseNote = input.note?.trim();

            const payerBalance = await ctx.db.query.currencyBalances.findFirst({
                where: eq(currencyBalances.id, input.payerCurrencyBalanceId),
                with: {
                    account: {
                        with: {
                            bank: true,
                        },
                    },
                },
            });

            if (!payerBalance || payerBalance.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Payer account not found' });
            }
            if (payerBalance.currencyCode !== splitCurrency) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: `Payer account currency must be ${splitCurrency}` });
            }
            if (Number(payerBalance.balance) < input.amountNow) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Insufficient funds. Available: ${Number(payerBalance.balance)}, Required: ${input.amountNow}`,
                });
            }

            const ownerAccountSharingEnabled = ((ownerUser.preferences as any)?.splitBill?.allowAccountSharing) !== false;
            let receiverBalance: any = null;
            if (input.receiverCurrencyBalanceId) {
                if (!ownerAccountSharingEnabled) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Receiver disabled account sharing' });
                }

                receiverBalance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.receiverCurrencyBalanceId),
                    with: {
                        account: {
                            with: {
                                bank: true,
                            },
                        },
                    },
                });
                if (!receiverBalance || receiverBalance.account.bank.userId !== ownerUser.id) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'Receiver account not found' });
                }
                if (receiverBalance.currencyCode !== splitCurrency) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: `Receiver account currency must be ${splitCurrency}` });
                }
            }

            // Reuse source category if available to current user; fallback to Unknown expense
            let payerCategoryId: string | null = null;
            const sourceCategory = split.transaction.category;
            if (sourceCategory) {
                if (!sourceCategory.userId || sourceCategory.userId === ctx.userId) {
                    payerCategoryId = sourceCategory.id;
                } else {
                    const matchedByName = await ctx.db.query.categories.findFirst({
                        where: and(
                            eq(categories.userId, ctx.userId!),
                            eq(categories.type, 'expense'),
                            sql`lower(${categories.name}) = lower(${sourceCategory.name})`
                        ),
                    });
                    if (matchedByName) {
                        payerCategoryId = matchedByName.id;
                    }
                }
            }
            if (!payerCategoryId) {
                const unknownCategory = await ctx.db.query.categories.findFirst({
                    where: and(
                        eq(categories.type, 'expense'),
                        sql`lower(${categories.name}) = 'unknown'`
                    ),
                });
                payerCategoryId = unknownCategory?.id || split.transaction.categoryId;
            }

            const [payerTx] = await ctx.db.insert(transactions).values({
                currencyBalanceId: input.payerCurrencyBalanceId,
                categoryId: payerCategoryId,
                amount: String(input.amountNow),
                type: 'expense',
                date: new Date().toISOString().split('T')[0],
                description: sourceCategory?.name
                    ? `Split payment to ${ownerLabel} (${sourceCategory.name})`
                    : `Split payment to ${ownerLabel}`,
            }).returning();

            await ctx.db.update(currencyBalances)
                .set({
                    balance: String(Number(payerBalance.balance) - input.amountNow),
                    updatedAt: new Date(),
                })
                .where(eq(currencyBalances.id, input.payerCurrencyBalanceId));

            let receivedTxId: string | undefined;
            if (receiverBalance) {
                let splitReceivedCategory = await ctx.db.query.categories.findFirst({
                    where: and(
                        eq(categories.userId, ownerUser.id),
                        eq(categories.name, 'Split Payment')
                    ),
                });
                if (!splitReceivedCategory) {
                    [splitReceivedCategory] = await ctx.db.insert(categories).values({
                        userId: ownerUser.id,
                        name: 'Split Payment',
                        icon: '💰',
                        color: '#10b981',
                        type: 'income',
                    }).returning();
                }

                const [receivedTx] = await ctx.db.insert(transactions).values({
                    currencyBalanceId: receiverBalance.id,
                    categoryId: splitReceivedCategory.id,
                    amount: String(input.amountNow),
                    type: 'income',
                    date: new Date().toISOString().split('T')[0],
                    description: `Split payment from ${responderLabel}`,
                }).returning();
                receivedTxId = receivedTx.id;

                await ctx.db.update(currencyBalances)
                    .set({
                        balance: String(Number(receiverBalance.balance) + input.amountNow),
                        updatedAt: new Date(),
                    })
                    .where(eq(currencyBalances.id, receiverBalance.id));
            }

            await ctx.db.insert(splitPayments).values({
                splitId: split.id,
                amount: String(input.amountNow),
                receivedToCurrencyBalanceId: input.receiverCurrencyBalanceId || undefined,
                linkedTransactionId: receivedTxId || payerTx.id,
                note: baseNote || `Paid by ${responderLabel}`,
                paidAt: new Date(),
            });

            const newPaidAmount = Number(split.paidAmount) + input.amountNow;
            const remainder = Number(split.owedAmount) - newPaidAmount;

            if (remainder <= 0.0001) {
                await ctx.db.update(transactionSplits)
                    .set({
                        paidAmount: split.owedAmount,
                        status: 'settled',
                        note: [split.note, baseNote, `Fully paid now by ${responderLabel}`].filter(Boolean).join(' | '),
                        updatedAt: new Date(),
                    })
                    .where(eq(transactionSplits.id, split.id));

                await ctx.db.insert(notifications).values({
                    userId: ownerUser.id,
                    type: 'general',
                    title: 'Split paid now',
                    message: `${responderLabel} paid the full split amount.`,
                    priority: 'medium',
                    links: { web: '/spending', mobile: 'woolet://spending', universal: 'https://woolet.app/spending' },
                    entityType: 'transaction',
                    entityId: split.transactionId,
                    metadata: {
                        splitId: split.id,
                        settlement: 'pay_now_full',
                        responderUserId: ctx.userId,
                    },
                });

                return { success: true, outcome: 'pay_now_full' as const };
            }

            const splitDescription = split.transaction.description || 'Split bill';
            const [ownerDebt] = await ctx.db.insert(debts).values({
                userId: ownerUser.id,
                currencyCode: splitCurrency,
                personName: responderLabel,
                amount: String(remainder),
                paidAmount: '0',
                type: 'they_owe',
                description: `Split bill debt (after partial payment): ${splitDescription}`,
                status: 'pending',
                isTest: ownerUser.testMode,
            }).returning();

            const [responderDebt] = await ctx.db.insert(debts).values({
                userId: ctx.userId!,
                currencyCode: splitCurrency,
                personName: ownerLabel,
                amount: String(remainder),
                paidAmount: '0',
                type: 'i_owe',
                description: `Split bill debt (after partial payment): ${splitDescription}`,
                status: 'pending',
                isTest: responderUser?.testMode ?? false,
            }).returning();

            await ctx.db.update(transactionSplits)
                .set({
                    paidAmount: split.owedAmount,
                    status: 'settled',
                    note: [
                        split.note,
                        baseNote,
                        `Partial pay now (${input.amountNow.toFixed(2)}), remainder debt (${remainder.toFixed(2)}): ${ownerDebt.id}/${responderDebt.id}`,
                    ].filter(Boolean).join(' | '),
                    updatedAt: new Date(),
                })
                .where(eq(transactionSplits.id, split.id));

            await ctx.db.insert(notifications).values([
                {
                    userId: ownerUser.id,
                    type: 'general',
                    title: 'Split partially paid',
                    message: `${responderLabel} paid ${input.amountNow.toFixed(2)} now. Remaining ${remainder.toFixed(2)} recorded as debt.`,
                    priority: 'medium',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt',
                    entityId: ownerDebt.id,
                    metadata: {
                        splitId: split.id,
                        settlement: 'pay_now_partial_to_debt',
                        responderUserId: ctx.userId,
                    },
                },
                {
                    userId: ctx.userId!,
                    type: 'debt_reminder',
                    title: 'Remaining split moved to debt',
                    message: `Remaining ${remainder.toFixed(2)} ${splitCurrency} was moved to debt.`,
                    priority: 'medium',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt',
                    entityId: responderDebt.id,
                    metadata: {
                        splitId: split.id,
                        linkedOwnerDebtId: ownerDebt.id,
                    },
                },
            ]);

            return {
                success: true,
                outcome: 'pay_now_partial_to_debt' as const,
                debtIds: {
                    ownerDebtId: ownerDebt.id,
                    responderDebtId: responderDebt.id,
                },
            };
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
            let linkedUserId: string | null = null;
            let linkedUsername: string | null = null;

            if (input.username) {
                const normalizedUsername = input.username.toLowerCase();
                const foundUser = await ctx.db.query.users.findFirst({
                    where: eq(users.username, normalizedUsername),
                    columns: {
                        id: true,
                        username: true,
                        name: true,
                    },
                });

                if (!foundUser) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'No user found with that username' });
                }

                if (foundUser.id === ctx.userId) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot add yourself as participant' });
                }

                linkedUserId = foundUser.id;
                linkedUsername = foundUser.username;
            }

            const [participant] = await ctx.db.insert(splitParticipants).values({
                userId: ctx.userId!,
                name: input.name,
                linkedUserId,
                linkedUsername,
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
            if (input.username !== undefined) {
                if (!input.username) {
                    updateData.linkedUserId = null;
                    updateData.linkedUsername = null;
                } else {
                    const normalizedUsername = input.username.toLowerCase();
                    const foundUser = await ctx.db.query.users.findFirst({
                        where: eq(users.username, normalizedUsername),
                        columns: { id: true, username: true },
                    });

                    if (!foundUser) {
                        throw new TRPCError({ code: 'NOT_FOUND', message: 'No user found with that username' });
                    }

                    if (foundUser.id === ctx.userId) {
                        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot add yourself as participant' });
                    }

                    updateData.linkedUserId = foundUser.id;
                    updateData.linkedUsername = foundUser.username;
                }
            }
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
