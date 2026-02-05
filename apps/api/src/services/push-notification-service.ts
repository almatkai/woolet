import webPush from 'web-push';
import { eq, and } from 'drizzle-orm';
import { pushSubscriptions } from '../db/schema';
import { db } from '../db';

if (!process.env.VAPID_SUBJECT) {
    console.warn('VAPID_SUBJECT not set - push notifications will not work');
}

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not set - push notifications will not work');
}

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@woolet.app',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    data?: Record<string, any>;
    tag?: string;
    requireInteraction?: boolean;
    silent?: boolean;
}

export async function sendPushNotification(
    userId: string,
    payload: PushPayload
): Promise<{ success: number; failed: number; errors: string[] }> {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn('Push notifications disabled - VAPID keys not configured');
        return { success: 0, failed: 0, errors: [] };
    }

    const userSubscriptions = await db.query.pushSubscriptions.findMany({
        where: and(
            eq(pushSubscriptions.userId, userId),
            eq(pushSubscriptions.isActive, true)
        ),
    });

    if (userSubscriptions.length === 0) {
        return { success: 0, failed: 0, errors: [] };
    }

    const subscriptionData = userSubscriptions.map(sub => ({
        endpoint: sub.endpoint,
        keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
        },
    }));

    const pushPayload = JSON.stringify({
        ...payload,
        icon: payload.icon || '/assets/woolet-icon.png',
        badge: payload.badge || '/assets/woolet-icon.png',
        data: {
            ...payload.data,
            url: payload.url || '/notifications',
        },
    });

    const results = await Promise.allSettled(
        subscriptionData.map(async (subscription) => {
            try {
                await webPush.sendNotification(
                    subscription as any,
                    pushPayload
                );
                return { success: true, subscription };
            } catch (error: any) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await markSubscriptionInactive(subscription.endpoint);
                }
                return { success: false, error: error.message, subscription };
            }
        })
    );

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const result of results) {
        if (result.status === 'fulfilled') {
            if (result.value.success) {
                success++;
            } else {
                failed++;
                errors.push(result.value.error || 'Unknown error');
            }
        } else {
            failed++;
            errors.push(result.reason?.message || 'Unknown error');
        }
    }

    return { success, failed, errors };
}

async function markSubscriptionInactive(endpoint: string) {
    try {
        await db.update(pushSubscriptions)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(pushSubscriptions.endpoint, endpoint));
    } catch (error) {
        console.error('Failed to mark subscription as inactive:', error);
    }
}

export async function createPushSubscription(
    userId: string,
    subscription: {
        endpoint: string;
        keys: {
            p256dh: string;
            auth: string;
        };
    },
    browserName?: string,
    expiresAt?: Date
) {
    const existing = await db.query.pushSubscriptions.findFirst({
        where: eq(pushSubscriptions.endpoint, subscription.endpoint),
    });

    if (existing) {
        await db.update(pushSubscriptions)
            .set({
                userId,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                browserName,
                isActive: true,
                lastUsedAt: new Date(),
                expiresAt,
                updatedAt: new Date(),
            })
            .where(eq(pushSubscriptions.id, existing.id));

        return existing;
    }

    const [newSubscription] = await db.insert(pushSubscriptions).values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        browserName,
        expiresAt,
        lastUsedAt: new Date(),
    }).returning();

    return newSubscription;
}

export async function deletePushSubscription(endpoint: string) {
    await db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function getUserPushSubscriptions(userId: string) {
    return await db.query.pushSubscriptions.findMany({
        where: and(
            eq(pushSubscriptions.userId, userId),
            eq(pushSubscriptions.isActive, true)
        ),
    });
}

export function getVapidPublicKey(): string {
    return VAPID_PUBLIC_KEY;
}
