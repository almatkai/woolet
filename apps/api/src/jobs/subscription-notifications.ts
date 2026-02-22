import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db';
import {
    subscriptions,
    subscriptionPayments,
    notifications,
    credits,
    creditPayments,
    mortgages,
    mortgagePayments,
    userSettings,
} from '../db/schema';
import { deliverNotificationChannels } from '../services/notification-delivery-service';
import { GlitchTip } from '../lib/error-tracking';

type ReminderKind = 'subscription' | 'credit' | 'mortgage';

function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function clampDayForMonth(year: number, month: number, day: number): number {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return Math.max(1, Math.min(day, lastDay));
}

function resolveNextMonthlyDueDate(today: Date, billingDay: number): Date {
    const thisMonthDay = clampDayForMonth(today.getFullYear(), today.getMonth(), billingDay);
    const current = new Date(today.getFullYear(), today.getMonth(), thisMonthDay);
    if (current >= today) {
        return current;
    }

    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextDay = clampDayForMonth(nextMonth.getFullYear(), nextMonth.getMonth(), billingDay);
    return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextDay);
}

function monthYear(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysUntil(date: Date, from: Date): number {
    return Math.ceil((date.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

async function recentNotificationExists(userId: string, entityId: string, entityType: ReminderKind): Promise<boolean> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await db.query.notifications.findFirst({
        where: and(
            eq(notifications.userId, userId),
            eq(notifications.entityId, entityId),
            eq(notifications.entityType, entityType),
            gte(notifications.createdAt, oneDayAgo),
        ),
    });
    return !!existing;
}

function buildReminderText(kind: ReminderKind, name: string, amount: string, currency: string, daysUntilDue: number) {
    const label = kind === 'subscription' ? 'Subscription' : kind === 'credit' ? 'Credit' : 'Mortgage';
    const overdue = daysUntilDue < 0;

    const title = overdue
        ? `${label} Overdue: ${name}`
        : daysUntilDue === 0
            ? `${label} Due Today: ${name}`
            : daysUntilDue === 1
                ? `${label} Due Tomorrow: ${name}`
                : `${label} Due Soon: ${name}`;

    const message = `${name} payment of ${currency} ${Number(amount).toLocaleString()} is ${
        overdue ? 'overdue' : `due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`
    }.`;

    const priority = overdue ? 'urgent' : daysUntilDue <= 1 ? 'high' : 'medium';

    return { title, message, priority } as const;
}

async function getUserReminderSettings(userId: string) {
    const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
    });

    return {
        notificationsEnabled: settings?.notificationsEnabled ?? true,
        subscriptionReminderDays: settings?.subscriptionReminderDays ?? 3,
        creditReminderDays: settings?.creditReminderDays ?? 3,
        mortgageReminderDays: settings?.mortgageReminderDays ?? 3,
    };
}

async function createAndDeliverReminder(params: {
    userId: string;
    kind: ReminderKind;
    entityId: string;
    name: string;
    amount: string;
    currency: string;
    dueDate: Date;
    daysUntilDue: number;
    webPath: string;
}) {
    const { title, message, priority } = buildReminderText(
        params.kind,
        params.name,
        params.amount,
        params.currency,
        params.daysUntilDue
    );

    await db.insert(notifications).values({
        userId: params.userId,
        type: 'payment_reminder',
        title,
        message,
        priority,
        links: {
            web: params.webPath,
            mobile: `woolet://${params.webPath.replace(/^\//, '')}`,
            universal: `https://woolet.app${params.webPath}`,
        },
        entityType: params.kind,
        entityId: params.entityId,
        metadata: {
            amount: params.amount,
            currency: params.currency,
            dueDate: params.dueDate.toISOString(),
            daysUntilDue: params.daysUntilDue,
        },
    });

    await deliverNotificationChannels({
        userId: params.userId,
        title,
        message,
        priority,
        url: params.webPath,
        entityType: params.kind,
        entityId: params.entityId,
        metadata: {
            dueDate: params.dueDate.toISOString(),
            daysUntilDue: params.daysUntilDue,
        },
    });
}

export async function runSubscriptionNotifications() {
    console.log('🔔 Running due reminders job (subscriptions, credits, mortgages)...');

    const today = startOfToday();
    let notified = 0;
    let skipped = 0;

    try {
        const activeSubscriptions = await db.query.subscriptions.findMany({
            where: and(eq(subscriptions.status, 'active'), eq(subscriptions.frequency, 'monthly')),
            with: {
                payments: {
                    orderBy: [desc(subscriptionPayments.paidAt)],
                    limit: 1,
                },
            },
        });

        for (const sub of activeSubscriptions) {
            try {
                const userPrefs = await getUserReminderSettings(sub.userId);
                if (!userPrefs.notificationsEnabled) {
                    skipped++;
                    continue;
                }

                const dueDate = resolveNextMonthlyDueDate(today, sub.billingDay || 1);
                const dayDiff = daysUntil(dueDate, today);

                if (dayDiff > userPrefs.subscriptionReminderDays || dayDiff < -7) {
                    skipped++;
                    continue;
                }

                const latestPayment = sub.payments[0];
                const paidThisDueMonth = latestPayment &&
                    new Date(latestPayment.paidAt).getMonth() === dueDate.getMonth() &&
                    new Date(latestPayment.paidAt).getFullYear() === dueDate.getFullYear();

                if (paidThisDueMonth) {
                    skipped++;
                    continue;
                }

                if (await recentNotificationExists(sub.userId, sub.id, 'subscription')) {
                    skipped++;
                    continue;
                }

                await createAndDeliverReminder({
                    userId: sub.userId,
                    kind: 'subscription',
                    entityId: sub.id,
                    name: sub.name,
                    amount: sub.amount,
                    currency: sub.currency,
                    dueDate,
                    daysUntilDue: dayDiff,
                    webPath: '/subscriptions',
                });
                notified++;
            } catch (subError) {
                console.error(`❌ Failed subscription reminder for ${sub.id}:`, subError);
                GlitchTip.captureException(subError, { extra: { entityType: 'subscription', entityId: sub.id } });
            }
        }

        const activeCredits = await db.query.credits.findMany({
            where: eq(credits.status, 'active'),
            with: {
                account: { with: { bank: true } },
                payments: {
                    orderBy: [desc(creditPayments.paidAt)],
                    limit: 4,
                },
            },
        });

        for (const credit of activeCredits) {
            try {
                const userId = credit.account.bank.userId;
                const userPrefs = await getUserReminderSettings(userId);
                if (!userPrefs.notificationsEnabled) {
                    skipped++;
                    continue;
                }

                const dueDate = resolveNextMonthlyDueDate(today, new Date(credit.startDate).getDate());
                const dayDiff = daysUntil(dueDate, today);

                if (dayDiff > userPrefs.creditReminderDays || dayDiff < -7) {
                    skipped++;
                    continue;
                }

                const dueMonthYear = monthYear(dueDate);
                const paidThisDueMonth = credit.payments.some((p) => p.monthYear === dueMonthYear);
                if (paidThisDueMonth) {
                    skipped++;
                    continue;
                }

                if (await recentNotificationExists(userId, credit.id, 'credit')) {
                    skipped++;
                    continue;
                }

                await createAndDeliverReminder({
                    userId,
                    kind: 'credit',
                    entityId: credit.id,
                    name: credit.name,
                    amount: credit.monthlyPayment,
                    currency: credit.currency,
                    dueDate,
                    daysUntilDue: dayDiff,
                    webPath: '/financial/credits',
                });
                notified++;
            } catch (creditError) {
                console.error(`❌ Failed credit reminder for ${credit.id}:`, creditError);
                GlitchTip.captureException(creditError, { extra: { entityType: 'credit', entityId: credit.id } });
            }
        }

        const activeMortgages = await db.query.mortgages.findMany({
            where: eq(mortgages.status, 'active'),
            with: {
                account: { with: { bank: true } },
                payments: {
                    orderBy: [desc(mortgagePayments.paidAt)],
                    limit: 4,
                },
            },
        });

        for (const mortgage of activeMortgages) {
            try {
                const userId = mortgage.account.bank.userId;
                const userPrefs = await getUserReminderSettings(userId);
                if (!userPrefs.notificationsEnabled) {
                    skipped++;
                    continue;
                }

                const dueDate = resolveNextMonthlyDueDate(today, mortgage.paymentDay || 1);
                const dayDiff = daysUntil(dueDate, today);

                if (dayDiff > userPrefs.mortgageReminderDays || dayDiff < -7) {
                    skipped++;
                    continue;
                }

                const dueMonthYear = monthYear(dueDate);
                const paidThisDueMonth = mortgage.payments.some((p) => p.monthYear === dueMonthYear);
                if (paidThisDueMonth) {
                    skipped++;
                    continue;
                }

                if (await recentNotificationExists(userId, mortgage.id, 'mortgage')) {
                    skipped++;
                    continue;
                }

                await createAndDeliverReminder({
                    userId,
                    kind: 'mortgage',
                    entityId: mortgage.id,
                    name: mortgage.propertyName,
                    amount: mortgage.monthlyPayment,
                    currency: mortgage.currency,
                    dueDate,
                    daysUntilDue: dayDiff,
                    webPath: '/financial/mortgages',
                });
                notified++;
            } catch (mortgageError) {
                console.error(`❌ Failed mortgage reminder for ${mortgage.id}:`, mortgageError);
                GlitchTip.captureException(mortgageError, { extra: { entityType: 'mortgage', entityId: mortgage.id } });
            }
        }

        console.log(`✅ Due reminders done: ${notified} sent, ${skipped} skipped`);
    } catch (error) {
        console.error('❌ Due reminders job failed:', error);
        GlitchTip.captureException(error, { extra: { job: 'dueReminders' } });
        throw error;
    }
}

export function startSubscriptionNotificationsCron() {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    console.log('⏰ Starting due reminders cron job (every 24h)...');

    runSubscriptionNotifications().catch((error) => {
        console.error('Initial due reminders run failed:', error);
    });

    setInterval(() => {
        runSubscriptionNotifications().catch((error) => {
            console.error('Scheduled due reminders failed:', error);
        });
    }, TWENTY_FOUR_HOURS);

    console.log('✅ Due reminders cron job initialized');
}
