import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../db';
import { subscriptions, subscriptionPayments, notifications } from '../db/schema';
import { sendPushNotification } from '../services/push-notification-service';
import { GlitchTip } from '../lib/error-tracking';

const DAYS_AHEAD = 3; // notify when due within 3 days

/**
 * For a given subscription, compute the next due date on or after today.
 */
function getNextDueDate(sub: { billingDay: number | null; frequency: string }, today: Date): Date {
    const billingDay = sub.billingDay || 1;

    if (sub.frequency === 'monthly') {
        // Try this calendar month first
        const candidate = new Date(today.getFullYear(), today.getMonth(), billingDay);
        if (candidate >= today) return candidate;
        // Roll to next month
        return new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
    }

    if (sub.frequency === 'yearly') {
        // billingDay encodes month*100 + day or just day; fall back to day 1 of year
        const candidate = new Date(today.getFullYear(), 0, billingDay);
        if (candidate >= today) return candidate;
        return new Date(today.getFullYear() + 1, 0, billingDay);
    }

    // weekly / daily: just use today + billingDay offset as a rough estimate
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + billingDay);
    return candidate;
}

/**
 * Returns true if the user already has a notification for this subscription
 * that was created within the last 24 hours (prevents duplicate pushes on re-runs).
 */
async function recentNotificationExists(userId: string, entityId: string): Promise<boolean> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await db.query.notifications.findFirst({
        where: and(
            eq(notifications.userId, userId),
            eq(notifications.entityId, entityId),
            gte(notifications.createdAt, oneDayAgo),
        ),
    });
    return !!existing;
}

export async function runSubscriptionNotifications() {
    console.log('🔔 Running subscription notifications job...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + DAYS_AHEAD);

    let notified = 0;
    let skipped = 0;

    try {
        // Fetch ALL active monthly subscriptions across all users
        const allActive = await db.query.subscriptions.findMany({
            where: and(
                eq(subscriptions.status, 'active'),
                eq(subscriptions.frequency, 'monthly'),
            ),
            with: {
                payments: {
                    orderBy: [desc(subscriptionPayments.paidAt)],
                    limit: 1,
                },
            },
        });

        console.log(`  Found ${allActive.length} active monthly subscriptions`);

        for (const sub of allActive) {
            try {
                const dueDate = getNextDueDate(sub, today);
                const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                // Only notify if due within window or overdue
                if (daysUntilDue > DAYS_AHEAD || daysUntilDue < -7) {
                    skipped++;
                    continue;
                }

                // Check if already paid this due-date month
                const lastPayment = sub.payments[0];
                const isPaidThisMonth =
                    lastPayment &&
                    new Date(lastPayment.paidAt).getMonth() === dueDate.getMonth() &&
                    new Date(lastPayment.paidAt).getFullYear() === dueDate.getFullYear();

                if (isPaidThisMonth) {
                    skipped++;
                    continue;
                }

                // Deduplicate: skip if we already sent a notification in the last 24h
                const alreadySent = await recentNotificationExists(sub.userId, sub.id);
                if (alreadySent) {
                    skipped++;
                    continue;
                }

                // Build notification content
                const isOverdue = daysUntilDue <= 0;
                const title = isOverdue
                    ? `Subscription Overdue: ${sub.name}`
                    : daysUntilDue === 1
                        ? `Subscription Due Tomorrow: ${sub.name}`
                        : daysUntilDue === 0
                            ? `Subscription Due Today: ${sub.name}`
                            : `Subscription Due Soon: ${sub.name}`;

                const message = `${sub.name} payment of ${sub.currency} ${Number(sub.amount).toLocaleString()} is ${
                    isOverdue ? 'overdue' : `due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`
                }.`;

                // 1. Insert into notifications table (shows in bell icon)
                await db.insert(notifications).values({
                    userId: sub.userId,
                    type: isOverdue ? 'subscription_overdue' : 'subscription_due',
                    title,
                    message,
                    priority: isOverdue ? 'urgent' : daysUntilDue <= 1 ? 'high' : 'medium',
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
                        dueDate: dueDate.toISOString(),
                        daysUntilDue,
                    },
                });

                // 2. Send push notification (shows in browser/device)
                await sendPushNotification(sub.userId, {
                    title,
                    body: message,
                    url: `/subscriptions/${sub.id}`,
                    tag: `subscription-${sub.id}-${dueDate.getMonth()}-${dueDate.getFullYear()}`,
                    requireInteraction: isOverdue,
                });

                notified++;
            } catch (subError) {
                console.error(`  ❌ Failed to notify for subscription ${sub.id}:`, subError);
                GlitchTip.captureException(subError, { extra: { subscriptionId: sub.id } });
            }
        }

        console.log(`✅ Subscription notifications done: ${notified} sent, ${skipped} skipped`);
    } catch (error) {
        console.error('❌ Subscription notifications job failed:', error);
        GlitchTip.captureException(error, { extra: { job: 'subscriptionNotifications' } });
        throw error;
    }
}

/**
 * Starts the daily subscription notifications cron job.
 * Runs once at startup (to catch any missed notifications), then every 24 hours.
 */
export function startSubscriptionNotificationsCron() {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    console.log('⏰ Starting subscription notifications cron job (every 24h)...');

    // Run once at startup
    runSubscriptionNotifications().catch((error) => {
        console.error('Initial subscription notifications run failed:', error);
    });

    // Then every 24 hours
    setInterval(() => {
        runSubscriptionNotifications().catch((error) => {
            console.error('Scheduled subscription notifications failed:', error);
        });
    }, TWENTY_FOUR_HOURS);

    console.log('✅ Subscription notifications cron job initialized');
}
