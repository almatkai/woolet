import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq, desc, sql, and, lt, inArray, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { debts, currencyBalances, debtPayments, transactions, categories, users, notifications } from '../db/schema';
import { checkEntityLimit } from '../lib/limits';
import { deliverNotificationChannels } from '../services/notification-delivery-service';
import { cache, CACHE_KEYS } from '../lib/redis';

/** Bank hierarchy + accounts list are cached; invalidate after any debt-driven balance change */
async function invalidateDebtBalanceCaches(userIds: (string | null | undefined)[]) {
    const ids = [...new Set(userIds.filter(Boolean))] as string[];
    for (const id of ids) {
        await cache.del(CACHE_KEYS.hierarchy(id));
        await cache.del(CACHE_KEYS.accounts(id));
        await cache.del(CACHE_KEYS.userDashboard(id));
        await cache.invalidatePattern(`spending:${id}:*`);
    }
}

async function getDebtRepaymentCategory(db: any) {
    let category = await db.query.categories.findFirst({
        where: (c: any, { eq: eqFn }: any) => eqFn(c.name, 'Debt Repayment'),
    });
    if (!category) {
        category = await db.query.categories.findFirst({
            where: (c: any, { ilike }: any) => ilike(c.name, '%debt%'),
        });
    }
    if (!category) {
        const [newCat] = await db.insert(categories).values({
            name: 'Debt Repayment',
            icon: '💸',
            color: '#f43f5e',
        }).returning();
        category = newCat;
    }
    return category;
}

/** Normalize decimal / driver-specific balance values for comparisons and checks. */
function parseMoney(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const s = String(value).replace(/,/g, '').trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

type DebtPeerShape = {
    id: string;
    userId: string | null;
    linkedUserId: string | null;
    amount: string;
    isTest: boolean;
    createdAt: Date;
};

async function findMirroredPeerDebt(
    db: { query: any; update: any },
    debt: DebtPeerShape,
    peerLifecycle: 'active' | 'deleting',
): Promise<(typeof debts.$inferSelect) | null> {
    if (!debt.linkedUserId || !debt.userId) return null;
    const whereClause = and(
        eq(debts.userId, debt.linkedUserId),
        eq(debts.linkedUserId, debt.userId),
        eq(debts.amount, debt.amount),
        eq(debts.isTest, debt.isTest),
        eq(debts.lifecycleStatus, peerLifecycle),
        ne(debts.id, debt.id),
    );
    const peers = await db.query.debts.findMany({ where: whereClause });
    if (peers.length === 0) return null;
    if (peers.length === 1) return peers[0];
    const t = debt.createdAt.getTime();
    return peers.reduce((best: (typeof peers)[number], p: (typeof peers)[number]) => {
        const bestDiff = Math.abs(best.createdAt.getTime() - t);
        const pDiff = Math.abs(p.createdAt.getTime() - t);
        return pDiff < bestDiff ? p : best;
    });
}

async function revertDebtRelatedTxEffects(
    db: { query: any; update: any },
    debtId: string,
) {
    const linkedTransactions = await db.query.transactions.findMany({
        where: eq(transactions.debtId, debtId),
    });

    for (const tx of linkedTransactions) {
        const amount = parseMoney(tx.amount);
        const balanceChange = tx.type === 'income'
            ? sql`${currencyBalances.balance} - ${amount}`
            : sql`${currencyBalances.balance} + ${amount}`;

        await db.update(currencyBalances)
            .set({
                balance: balanceChange,
                updatedAt: new Date(),
            })
            .where(eq(currencyBalances.id, tx.currencyBalanceId));

        await db.update(transactions)
            .set({ lifecycleStatus: 'deleting' })
            .where(eq(transactions.id, tx.id));
    }

    const payments = await db.query.debtPayments.findMany({
        where: eq(debtPayments.debtId, debtId),
    });

    for (const payment of payments) {
        const paymentTransactions = await db.query.transactions.findMany({
            where: eq(transactions.debtPaymentId, payment.id),
        });

        for (const tx of paymentTransactions) {
            const amount = parseMoney(tx.amount);
            const balanceChange = tx.type === 'income'
                ? sql`${currencyBalances.balance} - ${amount}`
                : sql`${currencyBalances.balance} + ${amount}`;

            await db.update(currencyBalances)
                .set({
                    balance: balanceChange,
                    updatedAt: new Date(),
                })
                .where(eq(currencyBalances.id, tx.currencyBalanceId));

            await db.update(transactions)
                .set({ lifecycleStatus: 'deleting' })
                .where(eq(transactions.id, tx.id));
        }
    }
}

async function restoreDebtRelatedTxEffects(
    db: { query: any; update: any },
    debtId: string,
) {
    const linkedTransactions = await db.query.transactions.findMany({
        where: eq(transactions.debtId, debtId),
    });

    for (const tx of linkedTransactions) {
        const amount = parseMoney(tx.amount);
        const balanceChange = tx.type === 'income'
            ? sql`${currencyBalances.balance} + ${amount}`
            : sql`${currencyBalances.balance} - ${amount}`;

        await db.update(currencyBalances)
            .set({
                balance: balanceChange,
                updatedAt: new Date(),
            })
            .where(eq(currencyBalances.id, tx.currencyBalanceId));

        await db.update(transactions)
            .set({ lifecycleStatus: 'active' })
            .where(eq(transactions.id, tx.id));
    }

    const payments = await db.query.debtPayments.findMany({
        where: eq(debtPayments.debtId, debtId),
    });

    for (const payment of payments) {
        const paymentTransactions = await db.query.transactions.findMany({
            where: eq(transactions.debtPaymentId, payment.id),
        });

        for (const tx of paymentTransactions) {
            const amount = parseMoney(tx.amount);
            const balanceChange = tx.type === 'income'
                ? sql`${currencyBalances.balance} + ${amount}`
                : sql`${currencyBalances.balance} - ${amount}`;

            await db.update(currencyBalances)
                .set({
                    balance: balanceChange,
                    updatedAt: new Date(),
                })
                .where(eq(currencyBalances.id, tx.currencyBalanceId));

            await db.update(transactions)
                .set({ lifecycleStatus: 'active' })
                .where(eq(transactions.id, tx.id));
        }
    }
}

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
                    linkedUser: {
                        columns: {
                            id: true,
                            username: true,
                            name: true,
                        }
                    },
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
            linkedUserId: z.string().optional().nullable(),
            amount: z.number().positive(),
            type: z.enum(['i_owe', 'they_owe']),
            description: z.string().optional(),
            dueDate: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const normalizedDueDate = input.dueDate?.trim() || null;
            const normalizedPersonName = input.personName.trim();
            let resolvedLinkedUserId = input.linkedUserId || null;

            // Check test mode limits
            await checkEntityLimit(ctx.db, ctx.userId!, 'debts');

            // 1. Validation: Must have either balanceId or currencyCode
            if (!input.currencyBalanceId && !input.currencyCode) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Either an account or a currency must be selected.'
                });
            }

            if (!resolvedLinkedUserId) {
                const potentialUsername = normalizedPersonName.replace(/^@/, '');
                const isUsernameLike = /^[a-zA-Z0-9_]{4,32}$/.test(potentialUsername);
                if (isUsernameLike) {
                    const userByUsername = await ctx.db.query.users.findFirst({
                        where: sql`lower(${users.username}) = ${potentialUsername.toLowerCase()}`,
                        columns: { id: true },
                    });
                    if (userByUsername && userByUsername.id !== ctx.userId) {
                        resolvedLinkedUserId = userByUsername.id;
                    }
                }
            }

            if (resolvedLinkedUserId) {
                if (resolvedLinkedUserId === ctx.userId) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'You cannot assign a debt to yourself.'
                    });
                }

                const linkedUser = await ctx.db.query.users.findFirst({
                    where: eq(users.id, resolvedLinkedUserId),
                    columns: { id: true },
                });

                if (!linkedUser) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Assigned user was not found.'
                    });
                }
            }

            if (resolvedLinkedUserId && !input.currencyBalanceId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Linked debt requests require selecting an account.'
                });
            }

            let selectedSourceBalance:
                | (typeof currencyBalances.$inferSelect & {
                    account?: {
                        bank?: {
                            userId: string | null;
                        } | null;
                    } | null;
                })
                | null = null;

            if (input.currencyBalanceId) {
                selectedSourceBalance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, input.currencyBalanceId),
                    with: {
                        account: {
                            with: {
                                bank: true,
                            },
                        },
                    },
                }) as any;

                if (!selectedSourceBalance) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Balance not found' });
                }

                if (selectedSourceBalance.account?.bank?.userId !== ctx.userId) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found' });
                }
            }

            // Check balance if lending money and tracked
            if (input.type === 'they_owe' && input.currencyBalanceId) {
                const balance = selectedSourceBalance;

                if (!balance || Number(balance.balance) < input.amount) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Insufficient funds. You only have ${balance?.balance ?? 0} ${balance?.currencyCode ?? ''} but are trying to lend ${input.amount}.`
                    });
                }
            }

            // 2. Create Debt Record
            const [debt] = await ctx.db.insert(debts).values({
                currencyBalanceId: input.currencyBalanceId,
                currencyCode: input.currencyCode,
                personName: normalizedPersonName,
                linkedUserId: resolvedLinkedUserId,
                amount: input.amount.toString(),
                type: input.type,
                description: input.description,
                dueDate: normalizedDueDate,
                userId: ctx.userId!,
                isTest: ctx.user.testMode,
            }).returning();

            const shouldDeferBorrowFunding = Boolean(resolvedLinkedUserId && input.type === 'i_owe');
            const debtCurrencyCode = selectedSourceBalance?.currencyCode || input.currencyCode || debt.currencyCode || 'USD';

            // 3. Create Pending Record for Recipient if linked
            let recipientDebtId: string | null = null;
            if (resolvedLinkedUserId) {
                const requesterLabel = ctx.user.name || ctx.user.username || 'Someone';
                const [recipientDebt] = await ctx.db.insert(debts).values({
                    userId: resolvedLinkedUserId,
                    personName: requesterLabel,
                    linkedUserId: ctx.userId!,
                    amount: input.amount.toString(),
                    type: input.type === 'they_owe' ? 'i_owe' : 'they_owe',
                    description: input.description,
                    dueDate: normalizedDueDate,
                    currencyCode: debtCurrencyCode,
                    status: 'awaiting_approval',
                    isTest: ctx.user.testMode,
                }).returning();
                recipientDebtId = recipientDebt.id;

                const requestMessage = input.type === 'they_owe'
                    ? `${requesterLabel} ${input.currencyBalanceId ? 'sent' : 'wants to lend'} you ${input.amount.toFixed(2)} ${debtCurrencyCode}. Choose where to receive it.`
                    : `${requesterLabel} is asking to borrow ${input.amount.toFixed(2)} ${debtCurrencyCode} from you. Choose a funding card to continue.`;

                const [requestNotification] = await ctx.db.insert(notifications).values({
                    userId: resolvedLinkedUserId,
                    type: 'debt_reminder',
                    title: input.type === 'they_owe' ? 'Incoming debt transfer' : 'Borrow request pending',
                    message: requestMessage,
                    priority: 'high',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt',
                    entityId: recipientDebtId,
                    metadata: {
                        requestKind: 'debt_transfer_request',
                        debtId: recipientDebtId,
                        senderDebtId: debt.id,
                        requesterUserId: ctx.userId,
                        requesterName: requesterLabel,
                        debtType: input.type,
                        amount: input.amount,
                        currencyCode: debtCurrencyCode,
                        requesterCurrencyBalanceId: input.currencyBalanceId ?? null,
                    },
                }).returning();

                await deliverNotificationChannels({
                    userId: resolvedLinkedUserId,
                    title: requestNotification.title,
                    message: requestMessage,
                    url: '/debts',
                    priority: 'high',
                    entityType: 'debt',
                    entityId: recipientDebtId,
                    metadata: requestNotification.metadata as any,
                });
            }

            // 4. Skip tracking if not linked to a balance or deferred
            if (!input.currencyBalanceId || shouldDeferBorrowFunding) {
                return debt;
            }

            // 5. Find or Create 'Debt' Category
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

            // 6. Update Balance
            const balanceChange = input.type === 'i_owe'
                ? sql`${currencyBalances.balance} + ${input.amount}`
                : sql`${currencyBalances.balance} - ${input.amount}`;

            await ctx.db.update(currencyBalances)
                .set({
                    balance: balanceChange,
                    updatedAt: new Date()
                })
                .where(eq(currencyBalances.id, input.currencyBalanceId));

            // 7. Create Transaction
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

            await invalidateDebtBalanceCaches([ctx.userId]);
            return debt;
        }),

    listIncomingRequests: protectedProcedure
        .input(z.object({
            limit: z.number().int().min(1).max(50).default(20),
        }).optional())
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db.query.notifications.findMany({
                where: and(
                    eq(notifications.userId, ctx.userId!),
                    sql`coalesce(${notifications.actionTaken}, false) = false`,
                    sql`(${notifications.metadata} ->> 'requestKind') = 'debt_transfer_request'`
                ),
                orderBy: [desc(notifications.createdAt)],
                limit: input?.limit ?? 20,
            });

            const debtIds = rows
                .map((row) => (row.metadata as any)?.debtId as string | undefined)
                .filter((id): id is string => Boolean(id));
            const requesterIds = rows
                .map((row) => (row.metadata as any)?.requesterUserId as string | undefined)
                .filter((id): id is string => Boolean(id));

            const debtRows = debtIds.length > 0
                ? await ctx.db.query.debts.findMany({
                    where: and(
                        inArray(debts.id, debtIds),
                        eq(debts.lifecycleStatus, 'active')
                    ),
                })
                : [];
            const requesterRows = requesterIds.length > 0
                ? await ctx.db.query.users.findMany({
                    where: inArray(users.id, requesterIds),
                    columns: {
                        id: true,
                        name: true,
                        username: true,
                    },
                })
                : [];

            const debtMap = new Map(debtRows.map((item) => [item.id, item]));
            const requesterMap = new Map(requesterRows.map((item) => [item.id, item]));

            return rows
                .map((notificationRow) => {
                    const metadata = (notificationRow.metadata || {}) as any;
                    const debtId = metadata.debtId as string | undefined;
                    if (!debtId) return null;
                    const debtRow = debtMap.get(debtId);
                    if (!debtRow) return null;
                    const requester = requesterMap.get(metadata.requesterUserId as string);
                    return {
                        notificationId: notificationRow.id,
                        debtId: debtRow.id,
                        debtType: metadata.debtType || debtRow.type,
                        amount: Number(metadata.amount ?? debtRow.amount ?? 0),
                        currencyCode: metadata.currencyCode || debtRow.currencyCode,
                        personName: debtRow.personName,
                        description: debtRow.description,
                        requesterUserId: metadata.requesterUserId as string,
                        requesterName: requester?.name || requester?.username || metadata.requesterName || 'Friend',
                        createdAt: notificationRow.createdAt,
                    };
                })
                .filter((item): item is NonNullable<typeof item> => Boolean(item));
        }),

    listIncomingDebtPaymentSync: protectedProcedure
        .input(z.object({
            limit: z.number().int().min(1).max(50).default(20),
        }).optional())
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db.query.notifications.findMany({
                where: and(
                    eq(notifications.userId, ctx.userId!),
                    sql`coalesce(${notifications.actionTaken}, false) = false`,
                    sql`(${notifications.metadata} ->> 'requestKind') = 'debt_repayment_sync'`,
                ),
                orderBy: [desc(notifications.createdAt)],
                limit: input?.limit ?? 20,
            });

            const out: {
                notificationId: string;
                paymentId: string;
                amount: number;
                currencyCode: string | null;
                paymentDate: string;
                note: string | null;
                proposerName: string;
                proposerDebtId: string;
                peerDebtId: string | null;
                peerDebtType: 'i_owe' | 'they_owe' | null;
            }[] = [];

            for (const row of rows) {
                const meta = (row.metadata || {}) as Record<string, unknown>;
                const paymentId = meta.paymentId as string | undefined;
                if (!paymentId) continue;

                const payment = await ctx.db.query.debtPayments.findFirst({
                    where: eq(debtPayments.id, paymentId),
                });
                if (!payment || payment.syncStatus !== 'awaiting_peer') continue;

                const proposerDebt = await ctx.db.query.debts.findFirst({
                    where: eq(debts.id, (meta.proposerDebtId as string) || payment.debtId),
                });
                const proposerUser = await ctx.db.query.users.findFirst({
                    where: eq(users.id, meta.proposerUserId as string),
                    columns: { id: true, name: true, username: true },
                });

                let peerDebtRow = (meta.peerDebtId as string)
                    ? await ctx.db.query.debts.findFirst({
                        where: and(
                            eq(debts.id, meta.peerDebtId as string),
                            eq(debts.userId, ctx.userId!),
                        ),
                    })
                    : null;

                if (!peerDebtRow && proposerDebt?.linkedUserId) {
                    peerDebtRow = await findMirroredPeerDebt(ctx.db, {
                        id: proposerDebt.id,
                        userId: proposerDebt.userId,
                        linkedUserId: proposerDebt.linkedUserId,
                        amount: proposerDebt.amount,
                        isTest: proposerDebt.isTest,
                        createdAt: proposerDebt.createdAt,
                    }, 'active');
                }

                out.push({
                    notificationId: row.id,
                    paymentId: payment.id,
                    amount: Number(meta.amount ?? payment.amount ?? 0),
                    currencyCode: (meta.currencyCode as string) || proposerDebt?.currencyCode || null,
                    paymentDate: (meta.paymentDate as string) || new Date(payment.paidAt as Date | string).toISOString().split('T')[0],
                    note: (meta.note as string) || payment.note || null,
                    proposerName: (meta.proposerName as string) || proposerUser?.name || proposerUser?.username || 'Friend',
                    proposerDebtId: (meta.proposerDebtId as string) || payment.debtId,
                    peerDebtId: peerDebtRow?.id ?? (meta.peerDebtId as string) ?? null,
                    peerDebtType: (peerDebtRow?.type as 'i_owe' | 'they_owe') ?? null,
                });
            }

            return out;
        }),

    respondToDebtPaymentSync: protectedProcedure
        .input(z.object({
            notificationId: z.string().uuid(),
            decision: z.enum(['approve', 'decline']),
            currencyBalanceId: z.string().uuid().optional(),
            distributions: z.array(z.object({
                currencyBalanceId: z.string().uuid(),
                amount: z.number().positive(),
            })).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const notif = await ctx.db.query.notifications.findFirst({
                where: and(
                    eq(notifications.id, input.notificationId),
                    eq(notifications.userId, ctx.userId!),
                ),
            });

            if (!notif) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification not found' });
            }
            if (notif.actionTaken) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already processed' });
            }

            const meta = (notif.metadata || {}) as Record<string, unknown>;
            if (meta.requestKind !== 'debt_repayment_sync' || !meta.paymentId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid repayment sync payload' });
            }

            const payment = await ctx.db.query.debtPayments.findFirst({
                where: eq(debtPayments.id, meta.paymentId as string),
            });

            if (!payment || payment.syncStatus !== 'awaiting_peer') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment is not pending peer confirmation' });
            }

            const proposerDebt = await ctx.db.query.debts.findFirst({
                where: and(
                    eq(debts.id, payment.debtId),
                    eq(debts.lifecycleStatus, 'active'),
                ),
                with: {
                    currencyBalance: true,
                },
            });

            if (!proposerDebt || proposerDebt.linkedUserId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed to respond to this repayment' });
            }

            const paymentAmount = Number(payment.amount);
            const debtCurrency = proposerDebt.currencyBalanceId
                ? (proposerDebt.currencyBalance as { currencyCode: string }).currencyCode
                : proposerDebt.currencyCode;

            if (input.decision === 'decline') {
                await ctx.db.delete(debtPayments).where(eq(debtPayments.id, payment.id));
                await ctx.db.update(notifications)
                    .set({
                        actionTaken: true,
                        actionTakenAt: new Date(),
                        isRead: true,
                        readAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(notifications.id, notif.id));

                const responderLabel = ctx.user.name || ctx.user.username || 'Friend';
                await ctx.db.insert(notifications).values({
                    userId: proposerDebt.userId!,
                    type: 'debt_reminder',
                    title: 'Repayment not confirmed',
                    message: `${responderLabel} declined to confirm your recorded repayment of ${paymentAmount.toFixed(2)} ${debtCurrency || ''}.`,
                    priority: 'medium',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt',
                    entityId: proposerDebt.id,
                    metadata: { kind: 'debt_repayment_declined' },
                });

                await invalidateDebtBalanceCaches([ctx.userId, proposerDebt.userId]);
                return { success: true, outcome: 'declined' as const };
            }

            let peerDistributions = input.distributions;
            if (!peerDistributions || peerDistributions.length === 0) {
                if (!input.currencyBalanceId) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Choose an account for your side of this repayment',
                    });
                }
                peerDistributions = [{ currencyBalanceId: input.currencyBalanceId, amount: paymentAmount }];
            }

            const totalPeer = peerDistributions.reduce((s, d) => s + d.amount, 0);
            if (Math.abs(totalPeer - paymentAmount) > 0.01) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Your side must total ${paymentAmount} (got ${totalPeer})`,
                });
            }

            const peerBalanceIds = peerDistributions.map((d) => d.currencyBalanceId);
            const peerBalances = await ctx.db.query.currencyBalances.findMany({
                where: (table, { inArray }) => inArray(table.id, peerBalanceIds),
                with: {
                    account: {
                        with: {
                            bank: true,
                        },
                    },
                },
            });

            for (const b of peerBalances) {
                if (b.account?.bank?.userId !== ctx.userId) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid account' });
                }
                if (b.currencyCode !== debtCurrency) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Account currency must be ${debtCurrency}`,
                    });
                }
            }

            const proposerDists = (payment.proposerDistributions as { currencyBalanceId: string; amount: number }[] | null) ?? [];
            if (proposerDists.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Missing proposer payment data' });
            }

            const propIds = proposerDists.map((d) => d.currencyBalanceId);
            const propBalances = await ctx.db.query.currencyBalances.findMany({
                where: (table, { inArray }) => inArray(table.id, propIds),
                with: {
                    account: {
                        with: {
                            bank: true,
                        },
                    },
                },
            });

            for (const b of propBalances) {
                if (b.account?.bank?.userId !== proposerDebt.userId) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'Proposer accounts invalid' });
                }
            }

            const peerDebt = await findMirroredPeerDebt(ctx.db, {
                id: proposerDebt.id,
                userId: proposerDebt.userId,
                linkedUserId: proposerDebt.linkedUserId,
                amount: proposerDebt.amount,
                isTest: proposerDebt.isTest,
                createdAt: proposerDebt.createdAt,
            }, 'active');

            if (!peerDebt) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Linked debt not found for counterparty' });
            }

            if (peerDebt.type === 'i_owe') {
                for (const d of peerDistributions) {
                    const bal = peerBalances.find((b) => b.id === d.currencyBalanceId);
                    if (bal && parseMoney(bal.balance) < d.amount - 0.001) {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: `Insufficient funds on selected account (need ${d.amount})`,
                        });
                    }
                }
            }

            const syncGroupId = randomUUID();
            const paymentDateStr = new Date(payment.paidAt as string | Date).toISOString().split('T')[0];

            const newProposerPaid = Number(proposerDebt.paidAmount) + paymentAmount;
            const totalProposerDebt = Number(proposerDebt.amount);
            const newProposerStatus = Math.abs(totalProposerDebt - newProposerPaid) < 0.01 ? 'paid' : 'partial';

            const newPeerPaid = Number(peerDebt.paidAmount) + paymentAmount;
            const totalPeerDebt = Number(peerDebt.amount);
            const newPeerStatus = Math.abs(totalPeerDebt - newPeerPaid) < 0.01 ? 'paid' : 'partial';

            await ctx.db.transaction(async (tx) => {
                const category = await getDebtRepaymentCategory(tx);

                for (const dist of proposerDists) {
                    const balanceChange = proposerDebt.type === 'they_owe'
                        ? sql`${currencyBalances.balance} + ${dist.amount}`
                        : sql`${currencyBalances.balance} - ${dist.amount}`;

                    await tx.update(currencyBalances)
                        .set({
                            balance: balanceChange,
                            updatedAt: new Date(),
                        })
                        .where(eq(currencyBalances.id, dist.currencyBalanceId));

                    const debtCreatedDate = new Date(proposerDebt.createdAt);
                    const repaymentDate = new Date(paymentDateStr);
                    const isSameMonth = debtCreatedDate.getFullYear() === repaymentDate.getFullYear()
                        && debtCreatedDate.getMonth() === repaymentDate.getMonth();

                    await tx.insert(transactions).values({
                        currencyBalanceId: dist.currencyBalanceId,
                        categoryId: category.id,
                        amount: dist.amount.toString(),
                        date: paymentDateStr,
                        type: proposerDebt.type === 'they_owe' ? 'income' : 'expense',
                        description: `Repayment ${proposerDebt.type === 'they_owe' ? 'from' : 'to'} ${proposerDebt.personName}${payment.note ? ` - ${payment.note}` : ''}`,
                        debtPaymentId: payment.id,
                        excludeFromMonthlyStats: isSameMonth,
                    });
                }

                await tx.update(debts)
                    .set({
                        paidAmount: newProposerPaid.toString(),
                        status: newProposerStatus,
                        updatedAt: new Date(),
                    })
                    .where(eq(debts.id, proposerDebt.id));

                await tx.update(debtPayments)
                    .set({
                        syncStatus: 'posted',
                        syncGroupId,
                    })
                    .where(eq(debtPayments.id, payment.id));

                const [peerPayment] = await tx.insert(debtPayments).values({
                    debtId: peerDebt.id,
                    amount: payment.amount,
                    paidAt: payment.paidAt,
                    note: payment.note,
                    syncStatus: 'posted',
                    syncGroupId,
                }).returning();

                for (const dist of peerDistributions) {
                    const balanceChange = peerDebt.type === 'they_owe'
                        ? sql`${currencyBalances.balance} + ${dist.amount}`
                        : sql`${currencyBalances.balance} - ${dist.amount}`;

                    await tx.update(currencyBalances)
                        .set({
                            balance: balanceChange,
                            updatedAt: new Date(),
                        })
                        .where(eq(currencyBalances.id, dist.currencyBalanceId));

                    const debtCreatedDate = new Date(peerDebt.createdAt);
                    const repaymentDate = new Date(paymentDateStr);
                    const isSameMonth = debtCreatedDate.getFullYear() === repaymentDate.getFullYear()
                        && debtCreatedDate.getMonth() === repaymentDate.getMonth();

                    await tx.insert(transactions).values({
                        currencyBalanceId: dist.currencyBalanceId,
                        categoryId: category.id,
                        amount: dist.amount.toString(),
                        date: paymentDateStr,
                        type: peerDebt.type === 'they_owe' ? 'income' : 'expense',
                        description: `Repayment ${peerDebt.type === 'they_owe' ? 'from' : 'to'} ${peerDebt.personName}${payment.note ? ` - ${payment.note}` : ''}`,
                        debtPaymentId: peerPayment.id,
                        excludeFromMonthlyStats: isSameMonth,
                    });
                }

                await tx.update(debts)
                    .set({
                        paidAmount: newPeerPaid.toString(),
                        status: newPeerStatus,
                        updatedAt: new Date(),
                    })
                    .where(eq(debts.id, peerDebt.id));

                await tx.update(notifications)
                    .set({
                        actionTaken: true,
                        actionTakenAt: new Date(),
                        isRead: true,
                        readAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(notifications.id, notif.id));
            });

            const proposerLabel = ctx.user.name || ctx.user.username || 'Friend';
            await ctx.db.insert(notifications).values({
                userId: proposerDebt.userId!,
                type: 'debt_reminder',
                title: 'Repayment confirmed',
                message: `${proposerLabel} confirmed your repayment of ${paymentAmount.toFixed(2)} ${debtCurrency || ''}.`,
                priority: 'medium',
                links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                entityType: 'debt',
                entityId: proposerDebt.id,
                metadata: { kind: 'debt_repayment_confirmed' },
            });

            await invalidateDebtBalanceCaches([ctx.userId, proposerDebt.userId]);
            return { success: true, outcome: 'approved' as const };
        }),

    respondToIncomingRequest: protectedProcedure
        .input(z.object({
            notificationId: z.string().uuid(),
            decision: z.enum(['approve', 'decline']),
            currencyBalanceId: z.string().uuid().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const requestNotification = await ctx.db.query.notifications.findFirst({
                where: and(
                    eq(notifications.id, input.notificationId),
                    eq(notifications.userId, ctx.userId!)
                ),
            });

            if (!requestNotification) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Request notification not found' });
            }
            if (requestNotification.actionTaken) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
            }

            const metadata = (requestNotification.metadata || {}) as any;
            if (metadata.requestKind !== 'debt_transfer_request' || !metadata.debtId || !metadata.requesterUserId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid debt request payload' });
            }

            // The requestDebt here is the record assigned to the RESPONDER (recipient of the notification)
            const responderDebt = await ctx.db.query.debts.findFirst({
                where: and(
                    eq(debts.id, metadata.debtId),
                    eq(debts.userId, ctx.userId!),
                    eq(debts.lifecycleStatus, 'active')
                ),
            });

            if (!responderDebt) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Debt record not found' });
            }

            // The requesterDebt is the original record created by the person who initiated
            const requesterDebtId = metadata.senderDebtId || metadata.debtId; // Fallback for old notifications
            const requesterDebt = await ctx.db.query.debts.findFirst({
                where: and(
                    eq(debts.id, requesterDebtId),
                    eq(debts.userId, metadata.requesterUserId),
                    eq(debts.lifecycleStatus, 'active')
                ),
            });

            if (!requesterDebt) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Original debt request not found' });
            }

            const requester = await ctx.db.query.users.findFirst({
                where: eq(users.id, metadata.requesterUserId),
                columns: { id: true, name: true, username: true, testMode: true },
            });

            if (!requester) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Requester not found' });
            }

            const requestAmount = Number(metadata.amount ?? requesterDebt.amount ?? 0);
            const requestCurrency = metadata.currencyCode || requesterDebt.currencyCode;

            if (input.decision === 'decline') {
                // If declined, we need to revert requester's balance if they already paid (they_owe)
                if (requesterDebt.type === 'they_owe') {
                    const linkedTransactions = await ctx.db.query.transactions.findMany({
                        where: eq(transactions.debtId, requesterDebt.id),
                    });

                    for (const tx of linkedTransactions) {
                        const amount = Number(tx.amount);
                        const balanceChange = tx.type === 'income'
                            ? sql`${currencyBalances.balance} - ${amount}`
                            : sql`${currencyBalances.balance} + ${amount}`;

                        await ctx.db.update(currencyBalances)
                            .set({
                                balance: balanceChange,
                                updatedAt: new Date(),
                            })
                            .where(eq(currencyBalances.id, tx.currencyBalanceId));
                    }

                    await ctx.db.delete(transactions).where(eq(transactions.debtId, requesterDebt.id));
                }

                // Delete both records
                await ctx.db.delete(debts).where(inArray(debts.id, [requesterDebt.id, responderDebt.id]));

                await ctx.db.update(notifications)
                    .set({
                        actionTaken: true,
                        actionTakenAt: new Date(),
                        isRead: true,
                        readAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(notifications.id, requestNotification.id));

                const responderLabel = ctx.user.name || ctx.user.username || 'Friend';
                await ctx.db.insert(notifications).values({
                    userId: requester.id,
                    type: 'debt_reminder',
                    title: 'Debt request declined',
                    message: `${responderLabel} declined your debt request.`,
                    priority: 'medium',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt',
                    entityId: requesterDebt.id,
                    metadata: {
                        requestKind: 'debt_transfer_request',
                        status: 'declined',
                    },
                });

                await invalidateDebtBalanceCaches([ctx.userId, requester.id]);
                return { success: true, outcome: 'declined' as const };
            }

            if (!input.currencyBalanceId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Please choose a card' });
            }

            const selectedBalance = await ctx.db.query.currencyBalances.findFirst({
                where: eq(currencyBalances.id, input.currencyBalanceId),
                with: {
                    account: {
                        with: {
                            bank: true,
                        },
                    },
                },
            });

            if (!selectedBalance || selectedBalance.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Card not found' });
            }
            if (selectedBalance.currencyCode !== requestCurrency) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Selected card currency must be ${requestCurrency}`,
                });
            }

            let debtCategory = await ctx.db.query.categories.findFirst({
                where: (c, { ilike }) => ilike(c.name, 'Debt'),
            });

            if (!debtCategory) {
                const [newCat] = await ctx.db.insert(categories).values({
                    name: 'Debt',
                    icon: '💸',
                    color: '#f43f5e',
                }).returning();
                debtCategory = newCat;
            }

            const responderLabel = ctx.user.name || ctx.user.username || 'Friend';
            const requesterLabel = requester.name || requester.username || responderDebt.personName;

            // Prefer notification metadata (requester's intent); fall back to mirrored debt row types.
            const requesterIsBorrowing =
                metadata.debtType != null && metadata.debtType !== ''
                    ? metadata.debtType === 'i_owe'
                    : responderDebt.type === 'they_owe';

            // Requester is lending (they_owe): responder receives on selected card.
            if (!requesterIsBorrowing) {
                await ctx.db.update(currencyBalances)
                    .set({
                        balance: sql`${currencyBalances.balance} + ${requestAmount}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(currencyBalances.id, selectedBalance.id));

                await ctx.db.insert(transactions).values({
                    currencyBalanceId: selectedBalance.id,
                    categoryId: debtCategory.id,
                    amount: requestAmount.toString(),
                    date: new Date().toISOString().split('T')[0],
                    type: 'income',
                    description: `Debt received from ${requesterLabel}`,
                    debtId: responderDebt.id,
                    excludeFromMonthlyStats: false,
                });

                await ctx.db.update(debts)
                    .set({
                        currencyBalanceId: selectedBalance.id,
                        status: 'pending',
                        updatedAt: new Date(),
                    })
                    .where(eq(debts.id, responderDebt.id));
            } else {
                // Requester is borrowing: responder lends from selected card; borrower must receive on their linked account.
                if (!requesterDebt.currencyBalanceId) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Borrower has no receiving account on this request. Decline and ask them to create the request again with a card selected.',
                    });
                }

                const requesterTargetBalance = await ctx.db.query.currencyBalances.findFirst({
                    where: eq(currencyBalances.id, requesterDebt.currencyBalanceId),
                    with: {
                        account: {
                            with: {
                                bank: true,
                            },
                        },
                    },
                });

                if (!requesterTargetBalance || requesterTargetBalance.account.bank.userId !== requester.id) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Borrower\'s receiving account is missing or invalid. Cannot complete transfer.',
                    });
                }

                const [freshLenderRow] = await ctx.db
                    .select({ balance: currencyBalances.balance })
                    .from(currencyBalances)
                    .where(eq(currencyBalances.id, selectedBalance.id));

                const lenderBalance = parseMoney(freshLenderRow?.balance);
                if (lenderBalance < requestAmount) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Insufficient funds. Available: ${lenderBalance}, Required: ${requestAmount}`,
                    });
                }

                await ctx.db.transaction(async (tx) => {
                    await tx.update(currencyBalances)
                        .set({
                            balance: sql`${currencyBalances.balance} - ${requestAmount}`,
                            updatedAt: new Date(),
                        })
                        .where(eq(currencyBalances.id, selectedBalance.id));

                    await tx.insert(transactions).values({
                        currencyBalanceId: selectedBalance.id,
                        categoryId: debtCategory.id,
                        amount: requestAmount.toString(),
                        date: new Date().toISOString().split('T')[0],
                        type: 'expense',
                        description: `Debt lent to ${requesterLabel}`,
                        debtId: responderDebt.id,
                        excludeFromMonthlyStats: false,
                    });

                    await tx.update(debts)
                        .set({
                            currencyBalanceId: selectedBalance.id,
                            status: 'pending',
                            updatedAt: new Date(),
                        })
                        .where(eq(debts.id, responderDebt.id));

                    await tx.update(currencyBalances)
                        .set({
                            balance: sql`${currencyBalances.balance} + ${requestAmount}`,
                            updatedAt: new Date(),
                        })
                        .where(eq(currencyBalances.id, requesterTargetBalance.id));

                    await tx.insert(transactions).values({
                        currencyBalanceId: requesterTargetBalance.id,
                        categoryId: debtCategory.id,
                        amount: requestAmount.toString(),
                        date: new Date().toISOString().split('T')[0],
                        type: 'income',
                        description: `Debt borrowed from ${responderLabel}`,
                        debtId: requesterDebt.id,
                        excludeFromMonthlyStats: false,
                    });
                });
            }

            await ctx.db.update(notifications)
                .set({
                    actionTaken: true,
                    actionTakenAt: new Date(),
                    isRead: true,
                    readAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(notifications.id, requestNotification.id));

            await ctx.db.insert(notifications).values({
                userId: requester.id,
                type: 'debt_reminder',
                title: 'Debt request approved',
                message: `${responderLabel} approved your debt request.`,
                priority: 'medium',
                links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                entityType: 'debt',
                entityId: requesterDebt.id,
                metadata: {
                    requestKind: 'debt_transfer_request',
                    status: 'approved',
                    resolverUserId: ctx.userId,
                },
            });

            await invalidateDebtBalanceCaches([ctx.userId, requester.id]);
            return { success: true, outcome: 'approved' as const };
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

            // Linked debt: counterparty must confirm and choose their account before both ledgers update
            if (debt.linkedUserId) {
                const peerDebtShape = await findMirroredPeerDebt(ctx.db, {
                    id: debt.id,
                    userId: debt.userId,
                    linkedUserId: debt.linkedUserId,
                    amount: debt.amount,
                    isTest: debt.isTest,
                    createdAt: debt.createdAt,
                }, 'active');

                const [paymentRecord] = await ctx.db.insert(debtPayments).values({
                    debtId: debt.id,
                    amount: input.amount.toString(),
                    paidAt: new Date(input.paymentDate),
                    note: input.note,
                    syncStatus: 'awaiting_peer',
                    proposedByUserId: ctx.userId!,
                    proposerDistributions: input.distributions,
                }).returning();

                const proposerLabel = ctx.user.name || ctx.user.username || 'Someone';
                const [requestNotification] = await ctx.db.insert(notifications).values({
                    userId: debt.linkedUserId,
                    type: 'debt_reminder',
                    title: 'Confirm debt repayment',
                    message: `${proposerLabel} recorded a repayment of ${input.amount.toFixed(2)} ${debtCurrency || ''}. Open Debts to confirm and choose the account for your side.`,
                    priority: 'high',
                    links: { web: '/debts', mobile: 'woolet://financial/debts', universal: 'https://woolet.app/debts' },
                    entityType: 'debt_payment',
                    entityId: paymentRecord.id,
                    metadata: {
                        requestKind: 'debt_repayment_sync',
                        paymentId: paymentRecord.id,
                        proposerDebtId: debt.id,
                        proposerUserId: ctx.userId,
                        peerDebtId: peerDebtShape?.id ?? null,
                        amount: input.amount,
                        currencyCode: debtCurrency,
                        paymentDate: input.paymentDate,
                        note: input.note ?? null,
                        proposerName: proposerLabel,
                    },
                }).returning();

                await deliverNotificationChannels({
                    userId: debt.linkedUserId,
                    title: requestNotification.title,
                    message: requestNotification.message,
                    url: '/debts',
                    priority: 'high',
                    entityType: 'debt_payment',
                    entityId: paymentRecord.id,
                    metadata: requestNotification.metadata as any,
                });

                return { success: true, awaitingPeerApproval: true as const, paymentId: paymentRecord.id };
            }

            // 1. Record Debt Payment (immediate — not linked)
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
            const category = await getDebtRepaymentCategory(ctx.db);

            for (const dist of input.distributions) {
                // Update Balance
                // Update Balance
                // If Borrow(i_owe), I am paying OUT, so balance DECREASES.
                // If Lend me (they_owe), I am receiving money, so balance INCREASES.
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
                    description: `Repayment ${debt.type === 'they_owe' ? 'from' : 'to'} ${debt.personName}${input.note ? ` - ${input.note}` : ''}`,
                    debtPaymentId: paymentRecord.id,
                    excludeFromMonthlyStats: isSameMonth,
                });
            }

            await invalidateDebtBalanceCaches([ctx.userId]);
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
            const normalizedDueDate = data.dueDate?.trim() || undefined;

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
            if (data.dueDate !== undefined) {
                updateValues.dueDate = normalizedDueDate ?? null;
            }

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

            if (payment.syncStatus === 'awaiting_peer') {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'This repayment is waiting for the other person to confirm; it cannot be edited yet.',
                });
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
                    const category = await getDebtRepaymentCategory(ctx.db);

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
                            description: `Repayment ${debt.type === 'they_owe' ? 'from' : 'to'} ${debt.personName}${data.note ?? payment.note ? ` - ${data.note ?? payment.note}` : ''}`,
                            debtPaymentId: id,
                            excludeFromMonthlyStats: isSameMonth,
                        });
                    }
                }
            }

            await ctx.db.update(debtPayments)
                .set(updateValues)
                .where(eq(debtPayments.id, id));

            await invalidateDebtBalanceCaches([ctx.userId]);
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
                // If it was expense (Lendd), revert by adding.
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
            await invalidateDebtBalanceCaches([ctx.userId]);
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

            if (payment.syncStatus === 'awaiting_peer') {
                if (debt.userId !== ctx.userId) {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed to cancel this repayment' });
                }
                await ctx.db.delete(notifications).where(
                    sql`(${notifications.metadata}->>'paymentId') = ${payment.id}`,
                );
                await ctx.db.delete(debtPayments).where(eq(debtPayments.id, input.id));
                await invalidateDebtBalanceCaches([ctx.userId, debt.linkedUserId]);
                return { success: true };
            }

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

            await invalidateDebtBalanceCaches([ctx.userId]);
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

            const peer = await findMirroredPeerDebt(ctx.db, debt, 'active');

            if (peer) {
                await revertDebtRelatedTxEffects(ctx.db, peer.id);
            }
            await revertDebtRelatedTxEffects(ctx.db, input.id);

            if (peer) {
                await ctx.db.update(debts)
                    .set({
                        lifecycleStatus: 'deleting',
                        updatedAt: new Date(),
                    })
                    .where(eq(debts.id, peer.id));
            }

            await ctx.db.update(debts)
                .set({
                    lifecycleStatus: 'deleting',
                    updatedAt: new Date(),
                })
                .where(eq(debts.id, input.id));

            await invalidateDebtBalanceCaches([ctx.userId, peer?.userId]);
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

            const peer = await findMirroredPeerDebt(ctx.db, debt, 'deleting');

            if (peer) {
                await restoreDebtRelatedTxEffects(ctx.db, peer.id);
            }
            await restoreDebtRelatedTxEffects(ctx.db, input.id);

            if (peer) {
                await ctx.db.update(debts)
                    .set({
                        lifecycleStatus: 'active',
                        updatedAt: new Date(),
                    })
                    .where(eq(debts.id, peer.id));
            }

            await ctx.db.update(debts)
                .set({
                    lifecycleStatus: 'active',
                    updatedAt: new Date(),
                })
                .where(eq(debts.id, input.id));

            await invalidateDebtBalanceCaches([ctx.userId, peer?.userId]);
            return { success: true };
        }),
});
