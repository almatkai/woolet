import { z } from 'zod';
import { eq, and, or, isNull, desc, gte, lte, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import {
    subscriptions,
    subscriptionPayments,
    currencyBalances,
    transactions,
    categories,
    banks,
    accounts,
    credits,
    mortgages,
    userSettings,
    creditPayments,
    mortgagePayments,
    notifications
} from '../db/schema';
import { checkEntityLimit } from '../lib/limits';
import { sendPushNotification } from '../services/push-notification-service';

export const subscriptionRouter = router({
    // List all subscriptions with optional type filter
    list: protectedProcedure
        .input(z.object({
            type: z.enum(['mobile', 'general', 'credit', 'mortgage', 'all']).default('all'),
            status: z.enum(['active', 'paused', 'cancelled', 'all']).default('all'),
            includeLinkedEntities: z.boolean().default(true), // Include credits/mortgages as subscriptions
        }).optional())
        .query(async ({ ctx, input }) => {
            const filters = input || { type: 'all', status: 'all', includeLinkedEntities: true };
            const conditions: any[] = [eq(subscriptions.userId, ctx.userId!)];

            if (filters.type !== 'all') {
                conditions.push(eq(subscriptions.type, filters.type));
            }
            if (filters.status !== 'all') {
                conditions.push(eq(subscriptions.status, filters.status));
            }

            const userSubscriptions = await ctx.db.query.subscriptions.findMany({
                where: and(...conditions),
                with: {
                    payments: {
                        orderBy: [desc(subscriptionPayments.paidAt)],
                        limit: 5,
                        with: {
                            currencyBalance: {
                                with: {
                                    account: true
                                }
                            }
                        }
                    }
                },
                orderBy: [desc(subscriptions.createdAt)]
            });

            // If requested, also include credits and mortgages as subscription-like items
            let linkedItems: any[] = [];
            if (filters.includeLinkedEntities && (filters.type === 'all' || filters.type === 'credit' || filters.type === 'mortgage')) {
                // Get user's banks to find their accounts
                const userBanks = await ctx.db.query.banks.findMany({
                    where: and(
                        eq(banks.userId, ctx.userId!),
                        eq(banks.isTest, ctx.user.testMode)
                    ),
                    with: { accounts: true }
                });
                const accountIds = userBanks.flatMap(b => b.accounts.map(a => a.id));

                if (accountIds.length > 0) {
                    // Get credits
                    if (filters.type === 'all' || filters.type === 'credit') {
                        const userCredits = await ctx.db.query.credits.findMany({
                            where: and(
                                inArray(credits.accountId, accountIds),
                                filters.status !== 'all' ? eq(credits.status, filters.status) : undefined
                            ),
                            with: {
                                account: true,
                                payments: {
                                    orderBy: [desc(sql`paid_at`)],
                                    limit: 5
                                }
                            }
                        });

                        linkedItems.push(...userCredits.map(c => ({
                            id: c.id,
                            name: c.name,
                            type: 'credit' as const,
                            amount: c.monthlyPayment,
                            currency: c.currency,
                            frequency: 'monthly' as const,
                            billingDay: new Date(c.startDate).getDate(),
                            startDate: c.startDate,
                            endDate: c.endDate,
                            status: c.status,
                            icon: '💳',
                            color: '#ef4444',
                            isLinked: true,
                            linkedEntityId: c.id,
                            linkedEntityType: 'credit',
                            payments: c.payments,
                            account: c.account,
                        })));
                    }

                    // Get mortgages
                    if (filters.type === 'all' || filters.type === 'mortgage') {
                        const userMortgages = await ctx.db.query.mortgages.findMany({
                            where: and(
                                inArray(mortgages.accountId, accountIds),
                                filters.status !== 'all' ? eq(mortgages.status, filters.status) : undefined
                            ),
                            with: {
                                account: true,
                                payments: {
                                    orderBy: [desc(sql`month_year`)],
                                    limit: 5
                                }
                            }
                        });

                        linkedItems.push(...userMortgages.map(m => ({
                            id: m.id,
                            name: m.propertyName,
                            type: 'mortgage' as const,
                            amount: m.monthlyPayment,
                            currency: m.currency,
                            frequency: 'monthly' as const,
                            billingDay: m.paymentDay || new Date(m.startDate).getDate(),
                            startDate: m.startDate,
                            endDate: null,
                            status: m.status,
                            icon: '🏠',
                            color: '#10b981',
                            isLinked: true,
                            linkedEntityId: m.id,
                            linkedEntityType: 'mortgage',
                            payments: m.payments,
                            account: m.account,
                        })));
                    }
                }
            }

            return {
                subscriptions: userSubscriptions.map(s => ({ ...s, isLinked: false })),
                linkedItems,
                total: userSubscriptions.length + linkedItems.length
            };
        }),

    // Get single subscription by ID
    getById: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const subscription = await ctx.db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.id, input.id),
                    eq(subscriptions.userId, ctx.userId!)
                ),
                with: {
                    payments: {
                        orderBy: [desc(subscriptionPayments.paidAt)],
                        with: {
                            currencyBalance: {
                                with: {
                                    account: {
                                        with: { bank: true }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
            }

            return subscription;
        }),

    // Create new subscription
    create: protectedProcedure
        .input(z.object({
            name: z.string().min(1).max(100),
            type: z.enum(['mobile', 'general', 'credit', 'mortgage']),
            amount: z.number().positive(),
            currency: z.string().length(3).default('USD'),
            frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
            billingDay: z.number().int().min(1).max(31).optional(),
            startDate: z.string(),
            endDate: z.string().optional(),
            status: z.enum(['active', 'paused', 'cancelled']).default('active'),
            icon: z.string().default('📱'),
            color: z.string().default('#6366f1'),
            description: z.string().optional(),
            linkedEntityId: z.string().uuid().optional(),
            linkedEntityType: z.enum(['credit', 'mortgage']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Check test mode limits
            await checkEntityLimit(ctx.db, ctx.userId!, 'subscriptions');

            const billingDay = input.billingDay ?? new Date(input.startDate).getDate();

            const [subscription] = await ctx.db.insert(subscriptions).values({
                userId: ctx.userId!,
                name: input.name,
                type: input.type,
                amount: input.amount.toString(),
                currency: input.currency,
                frequency: input.frequency,
                billingDay,
                startDate: input.startDate,
                endDate: input.endDate || null,
                status: input.status,
                icon: input.icon,
                color: input.color,
                description: input.description,
                linkedEntityId: input.linkedEntityId,
                linkedEntityType: input.linkedEntityType,
            }).returning();

            return subscription;
        }),

    // Update subscription
    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().min(1).max(100).optional(),
            amount: z.number().positive().optional(),
            frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
            billingDay: z.number().int().min(1).max(31).optional(),
            startDate: z.string().optional(),
            endDate: z.string().nullable().optional(),
            status: z.enum(['active', 'paused', 'cancelled']).optional(),
            icon: z.string().optional(),
            color: z.string().optional(),
            description: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const existing = await ctx.db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.id, input.id),
                    eq(subscriptions.userId, ctx.userId!)
                )
            });

            if (!existing) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
            }

            const updateData: Record<string, any> = { updatedAt: new Date() };
            if (input.name !== undefined) updateData.name = input.name;
            if (input.amount !== undefined) updateData.amount = input.amount.toString();
            if (input.frequency !== undefined) updateData.frequency = input.frequency;

            if (input.startDate !== undefined) {
                updateData.startDate = input.startDate;
                if (input.billingDay === undefined) {
                    updateData.billingDay = new Date(input.startDate).getDate();
                }
            }

            if (input.billingDay !== undefined) updateData.billingDay = input.billingDay;
            if (input.endDate !== undefined) updateData.endDate = input.endDate;
            if (input.status !== undefined) updateData.status = input.status;
            if (input.icon !== undefined) updateData.icon = input.icon;
            if (input.color !== undefined) updateData.color = input.color;
            if (input.description !== undefined) updateData.description = input.description;

            await ctx.db.update(subscriptions)
                .set(updateData)
                .where(eq(subscriptions.id, input.id));

            return { success: true };
        }),

    // Delete subscription
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const existing = await ctx.db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.id, input.id),
                    eq(subscriptions.userId, ctx.userId!)
                )
            });

            if (!existing) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
            }

            await ctx.db.delete(subscriptions).where(eq(subscriptions.id, input.id));
            return { success: true };
        }),

    // Make payment for a subscription
    makePayment: protectedProcedure
        .input(z.object({
            subscriptionId: z.string().uuid(),
            currencyBalanceId: z.string().uuid(),
            amount: z.number().positive(),
            paidAt: z.string().optional(), // defaults to now
            note: z.string().optional(),
            dueDate: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // 1. Verify subscription ownership
            const subscription = await ctx.db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.id, input.subscriptionId),
                    eq(subscriptions.userId, ctx.userId!)
                )
            });

            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
            }

            // 2. Verify account ownership and get balance
            const currencyBalance = await ctx.db.query.currencyBalances.findFirst({
                where: eq(currencyBalances.id, input.currencyBalanceId),
                with: {
                    account: {
                        with: { bank: true }
                    }
                }
            });

            if (!currencyBalance || currencyBalance.account.bank.userId !== ctx.userId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Account not found' });
            }

            const currentBalance = Number(currencyBalance.balance);
            if (currentBalance < input.amount) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Insufficient funds. Available: ${currentBalance}, Required: ${input.amount}`
                });
            }

            // 3. Find or create 'Subscription' category
            let subscriptionCategory = await ctx.db.query.categories.findFirst({
                where: (c, { ilike }) => ilike(c.name, '%subscription%')
            });

            if (!subscriptionCategory) {
                const [newCat] = await ctx.db.insert(categories).values({
                    name: 'Subscriptions',
                    icon: '🔄',
                    color: '#6366f1',
                }).returning();
                subscriptionCategory = newCat;
            }

            // 4. Create transaction
            const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
            const [transaction] = await ctx.db.insert(transactions).values({
                currencyBalanceId: input.currencyBalanceId,
                categoryId: subscriptionCategory.id,
                amount: input.amount.toString(),
                description: `${subscription.name} - Subscription payment`,
                date: paidAt.toISOString().split('T')[0],
                type: 'expense',
            }).returning();

            // 5. Deduct from account
            await ctx.db.update(currencyBalances)
                .set({ balance: (currentBalance - input.amount).toString() })
                .where(eq(currencyBalances.id, input.currencyBalanceId));

            // 6. Record subscription payment
            const [payment] = await ctx.db.insert(subscriptionPayments).values({
                subscriptionId: input.subscriptionId,
                currencyBalanceId: input.currencyBalanceId,
                amount: input.amount.toString(),
                paidAt,
                dueDate: input.dueDate ? new Date(input.dueDate) : null,
                transactionId: transaction.id,
                note: input.note,
            }).returning();

            return {
                success: true,
                payment,
                transaction,
                newBalance: currentBalance - input.amount
            };
        }),

    // Get upcoming subscription payments (for timeline view)
    getUpcoming: protectedProcedure
        .input(z.object({
            days: z.number().int().min(1).max(90).default(30),
        }).optional())
        .query(async ({ ctx, input }) => {
            const days = input?.days || 30;
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + days);

            // Fetch user settings
            const [settings] = await ctx.db
                .select()
                .from(userSettings)
                .where(eq(userSettings.userId, ctx.userId!))
                .limit(1);
            
            const logic = settings?.mortgageStatusLogic || settings?.paymentStatusLogic || 'monthly';
            const period = parseInt(settings?.mortgageStatusPeriod || settings?.paymentStatusPeriod || '15');

            const upcoming: Array<{
                subscription: any;
                dueDate: Date;
                isPaid: boolean;
            }> = [];

            // 1. Get active subscriptions
            const activeSubscriptions = await ctx.db.query.subscriptions.findMany({
                where: and(
                    eq(subscriptions.userId, ctx.userId!),
                    eq(subscriptions.status, 'active')
                ),
                with: {
                    payments: {
                        orderBy: [desc(subscriptionPayments.paidAt)],
                        limit: 1
                    }
                }
            });

            for (const sub of activeSubscriptions) {
                const billingDay = sub.billingDay || 1;
                let nextDue = new Date(today.getFullYear(), today.getMonth(), billingDay);

                if (nextDue < today) nextDue.setMonth(nextDue.getMonth() + 1);

                const lastPayment = sub.payments[0];
                const isPaid = lastPayment &&
                    new Date(lastPayment.paidAt).getMonth() === nextDue.getMonth() &&
                    new Date(lastPayment.paidAt).getFullYear() === nextDue.getFullYear();

                if (nextDue <= endDate) {
                    upcoming.push({
                        subscription: { ...sub, isLinked: false },
                        dueDate: nextDue,
                        isPaid: !!isPaid
                    });
                }
            }

            // 2. Get active credits and mortgages (linked items)
            const userBanks = await ctx.db.query.banks.findMany({
                where: and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ),
                with: { accounts: true }
            });
            const accountIds = userBanks.flatMap(b => b.accounts.map(a => a.id));

            if (accountIds.length > 0) {
                const userCredits = await ctx.db.query.credits.findMany({
                    where: and(
                        inArray(credits.accountId, accountIds),
                        eq(credits.status, 'active')
                    ),
                    with: {
                        payments: {
                            orderBy: [desc(sql`paid_at`)],
                            limit: 1
                        }
                    }
                });

                for (const credit of userCredits) {
                    const billingDay = new Date(credit.startDate).getDate();
                    let nextDue = new Date(today.getFullYear(), today.getMonth(), billingDay);
                    if (nextDue < today) nextDue.setMonth(nextDue.getMonth() + 1);

                    const lastPayment = credit.payments[0];
                    const isPaid = lastPayment &&
                        new Date(lastPayment.paidAt).getMonth() === nextDue.getMonth() &&
                        new Date(lastPayment.paidAt).getFullYear() === nextDue.getFullYear();

                    if (nextDue <= endDate) {
                        upcoming.push({
                            subscription: {
                                id: credit.id,
                                name: credit.name,
                                type: 'credit',
                                amount: credit.monthlyPayment,
                                currency: credit.currency,
                                frequency: 'monthly',
                                status: credit.status,
                                icon: '💳',
                                color: '#ef4444',
                                isLinked: true,
                                linkedEntityId: credit.id,
                                linkedEntityType: 'credit'
                            },
                            dueDate: nextDue,
                            isPaid: !!isPaid
                        });
                    }
                }

                const userMortgages = await ctx.db.query.mortgages.findMany({
                    where: and(
                        inArray(mortgages.accountId, accountIds),
                        eq(mortgages.status, 'active')
                    ),
                    with: {
                        payments: {
                            orderBy: [desc(sql`month_year`)],
                            limit: 1
                        }
                    }
                });

                for (const mortgage of userMortgages) {
                    const billingDay = mortgage.paymentDay || 1;
                    let nextDue = new Date(today.getFullYear(), today.getMonth(), billingDay);
                    if (nextDue < today) nextDue.setMonth(nextDue.getMonth() + 1);

                    const monthYear = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}`;
                    const isPaid = mortgage.payments.some(p => p.monthYear === monthYear);

                    if (nextDue <= endDate) {
                        upcoming.push({
                            subscription: {
                                id: mortgage.id,
                                name: mortgage.propertyName,
                                type: 'mortgage',
                                amount: mortgage.monthlyPayment,
                                currency: mortgage.currency,
                                frequency: 'monthly',
                                status: mortgage.status,
                                icon: '🏠',
                                color: '#10b981',
                                isLinked: true,
                                linkedEntityId: mortgage.id,
                                linkedEntityType: 'mortgage'
                            },
                            dueDate: nextDue,
                            isPaid: !!isPaid
                        });
                    }
                }
            }

            // Sort by due date
            upcoming.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

            return upcoming;
        }),

    // Get calendar view data
    getCalendarView: protectedProcedure
        .input(z.object({
            year: z.number().int(),
            month: z.number().int().min(1).max(12),
        }))
        .query(async ({ ctx, input }) => {
            const startOfMonth = new Date(input.year, input.month - 1, 1);
            const endOfMonth = new Date(input.year, input.month, 0);
            const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
            const endOfMonthStr = endOfMonth.toISOString().split('T')[0];

            // Build calendar data - group by billing day
            const calendarData: Record<number, Array<{
                subscription: any;
                isPaid: boolean;
            }>> = {};

            // 1. Process regular subscriptions
            const activeSubscriptions = await ctx.db.query.subscriptions.findMany({
                where: and(
                    eq(subscriptions.userId, ctx.userId!),
                    eq(subscriptions.status, 'active'),
                    // Only include subscriptions that haven't ended before the requested month
                    or(isNull(subscriptions.endDate), gte(subscriptions.endDate, startOfMonthStr))
                ),
                with: {
                    payments: {
                        where: and(
                            gte(subscriptionPayments.paidAt, startOfMonth),
                            lte(subscriptionPayments.paidAt, endOfMonth)
                        )
                    }
                }
            });

            for (const sub of activeSubscriptions) {
                const billingDay = Math.min(sub.billingDay || 1, endOfMonth.getDate());
                if (!calendarData[billingDay]) calendarData[billingDay] = [];

                const isPaid = sub.payments.some(p =>
                    new Date(p.paidAt).getMonth() + 1 === input.month &&
                    new Date(p.paidAt).getFullYear() === input.year
                );

                calendarData[billingDay].push({
                    subscription: { ...sub, isLinked: false },
                    isPaid
                });
            }

            // 2. Process credits and mortgages
            const userBanks = await ctx.db.query.banks.findMany({
                where: and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ),
                with: { accounts: true }
            });
            const accountIds = userBanks.flatMap(b => b.accounts.map(a => a.id));

            if (accountIds.length > 0) {
                const userCredits = await ctx.db.query.credits.findMany({
                    where: and(
                        inArray(credits.accountId, accountIds),
                        eq(credits.status, 'active'),
                        // Only include credits that haven't ended before the requested month
                        gte(credits.endDate, startOfMonthStr)
                    ),
                    with: {
                        payments: {
                            where: and(
                                gte(creditPayments.paidAt, startOfMonth),
                                lte(creditPayments.paidAt, endOfMonth)
                            )
                        }
                    }
                });

                for (const credit of userCredits) {
                    const billingDay = Math.min(new Date(credit.startDate).getDate(), endOfMonth.getDate());
                    if (!calendarData[billingDay]) calendarData[billingDay] = [];

                    const isPaid = credit.payments.length > 0;
                    calendarData[billingDay].push({
                        subscription: {
                            id: credit.id,
                            name: credit.name,
                            type: 'credit',
                            amount: credit.monthlyPayment,
                            currency: credit.currency,
                            frequency: 'monthly',
                            status: credit.status,
                            icon: '💳',
                            color: '#ef4444',
                            isLinked: true,
                            linkedEntityId: credit.id,
                            linkedEntityType: 'credit'
                        },
                        isPaid
                    });
                }

                const monthYear = `${input.year}-${String(input.month).padStart(2, '0')}`;
                const userMortgages = await ctx.db.query.mortgages.findMany({
                    where: and(
                        inArray(mortgages.accountId, accountIds),
                        eq(mortgages.status, 'active'),
                        // Include mortgages with no endDate or that end on/after the month start
                        or(isNull(mortgages.endDate), gte(mortgages.endDate, startOfMonthStr))
                    ),
                    with: {
                        payments: {
                            where: eq(mortgagePayments.monthYear, monthYear)
                        }
                    }
                });

                for (const mortgage of userMortgages) {
                    const billingDay = Math.min(mortgage.paymentDay || 1, endOfMonth.getDate());
                    if (!calendarData[billingDay]) calendarData[billingDay] = [];

                    const isPaid = mortgage.payments.length > 0;
                    calendarData[billingDay].push({
                        subscription: {
                            id: mortgage.id,
                            name: mortgage.propertyName,
                            type: 'mortgage',
                            amount: mortgage.monthlyPayment,
                            currency: mortgage.currency,
                            frequency: 'monthly',
                            status: mortgage.status,
                            icon: '🏠',
                            color: '#10b981',
                            isLinked: true,
                            linkedEntityId: mortgage.id,
                            linkedEntityType: 'mortgage'
                        },
                        isPaid
                    });
                }
            }

            return {
                year: input.year,
                month: input.month,
                daysInMonth: endOfMonth.getDate(),
                data: calendarData
            };
        }),

    // Check for due subscriptions and create notifications + send push
    checkAndNotifyDueSubscriptions: protectedProcedure
        .input(z.object({
            daysAhead: z.number().int().min(1).max(7).default(3),
        }).optional())
        .mutation(async ({ ctx, input }) => {
            const daysAhead = input?.daysAhead || 3;
            const today = new Date();
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + daysAhead);

            const createdNotifications: string[] = [];

            const activeSubscriptions = await ctx.db.query.subscriptions.findMany({
                where: and(
                    eq(subscriptions.userId, ctx.userId!),
                    eq(subscriptions.status, 'active')
                ),
                with: {
                    payments: {
                        orderBy: [desc(subscriptionPayments.paidAt)],
                        limit: 1
                    }
                }
            });

            for (const sub of activeSubscriptions) {
                const billingDay = sub.billingDay || 1;
                const currentMonthDue = new Date(today.getFullYear(), today.getMonth(), billingDay);
                
                if (currentMonthDue < today) {
                    currentMonthDue.setMonth(currentMonthDue.getMonth() + 1);
                }

                const daysUntilDue = Math.ceil((currentMonthDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                
                const lastPayment = sub.payments[0];
                const isPaidThisMonth = lastPayment &&
                    new Date(lastPayment.paidAt).getMonth() === currentMonthDue.getMonth() &&
                    new Date(lastPayment.paidAt).getFullYear() === currentMonthDue.getFullYear();

                if (!isPaidThisMonth && daysUntilDue >= 0 && daysUntilDue <= daysAhead) {
                    try {
                        const isOverdue = daysUntilDue <= 0;
                        const title = isOverdue
                            ? `Subscription Overdue: ${sub.name}`
                            : daysUntilDue === 1
                                ? `Subscription Due Tomorrow: ${sub.name}`
                                : `Subscription Due: ${sub.name}`;
                        const message = `${sub.name} payment of ${sub.currency} ${Number(sub.amount).toLocaleString()} is ${isOverdue ? 'overdue' : `due in ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`}.`;

                        await ctx.db.insert(notifications).values({
                            userId: ctx.userId!,
                            type: isOverdue ? 'subscription_overdue' as const : 'subscription_due' as const,
                            title,
                            message,
                            priority: isOverdue ? 'urgent' as const : daysUntilDue <= 1 ? 'high' as const : 'medium' as const,
                            links: {
                                web: `/subscriptions/${sub.id}`,
                                mobile: `woolet://subscriptions/${sub.id}`,
                                universal: `https://woolet.app/subscriptions/${sub.id}`,
                            },
                            entityType: 'subscription',
                            entityId: sub.id,
                            metadata: {
                                amount: sub.amount,
                                currency: sub.currency,
                                billingDay: sub.billingDay,
                                dueDate: currentMonthDue.toISOString(),
                                daysUntilDue,
                            },
                        });

                        // Also send push notification
                        await sendPushNotification(ctx.userId!, {
                            title,
                            body: message,
                            url: `/subscriptions/${sub.id}`,
                            tag: `subscription-${sub.id}-${currentMonthDue.getMonth()}-${currentMonthDue.getFullYear()}`,
                            requireInteraction: isOverdue,
                        });

                        createdNotifications.push(sub.id);
                    } catch (error) {
                        console.error(`Failed to create notification for subscription ${sub.id}:`, error);
                    }
                }
            }

            return {
                success: true,
                notificationsCreated: createdNotifications.length,
                subscriptionIds: createdNotifications,
            };
        }),
});
