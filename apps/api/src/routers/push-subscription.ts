import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { pushSubscriptions } from '../db/schema';
import {
    createPushSubscription,
    deletePushSubscription,
    getUserPushSubscriptions,
    getVapidPublicKey,
    sendPushNotification,
    type PushPayload,
} from '../services/push-notification-service';

export const pushSubscriptionRouter = router({
    // Get VAPID public key for the client
    getVapidPublicKey: protectedProcedure
        .query(() => {
            const publicKey = getVapidPublicKey();
            if (!publicKey) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Push notifications are not configured',
                });
            }
            return { publicKey };
        }),

    // Subscribe to push notifications
    subscribe: protectedProcedure
        .input(z.object({
            endpoint: z.string().url(),
            keys: z.object({
                p256dh: z.string(),
                auth: z.string(),
            }),
            browserName: z.string().optional(),
            expirationTime: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const expiresAt = input.expirationTime
                ? new Date(input.expirationTime)
                : undefined;

            await createPushSubscription(
                ctx.userId!,
                {
                    endpoint: input.endpoint,
                    keys: input.keys,
                },
                input.browserName,
                expiresAt
            );

            return { success: true };
        }),

    // Unsubscribe from push notifications
    unsubscribe: protectedProcedure
        .input(z.object({ endpoint: z.string().url() }))
        .mutation(async ({ ctx, input }) => {
            const existing = await db.query.pushSubscriptions.findFirst({
                where: and(
                    eq(pushSubscriptions.endpoint, input.endpoint),
                    eq(pushSubscriptions.userId, ctx.userId!)
                ),
            });

            if (!existing) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Subscription not found',
                });
            }

            await deletePushSubscription(input.endpoint);
            return { success: true };
        }),

    // Get user's push subscriptions
    list: protectedProcedure
        .query(async ({ ctx }) => {
            const subscriptions = await getUserPushSubscriptions(ctx.userId!);
            return subscriptions.map(sub => ({
                id: sub.id,
                browserName: sub.browserName,
                isActive: sub.isActive,
                lastUsedAt: sub.lastUsedAt,
                createdAt: sub.createdAt,
            }));
        }),

    // Test push notification (for debugging)
    test: protectedProcedure
        .input(z.object({
            title: z.string().default('Test Notification'),
            body: z.string().default('This is a test notification from Woolet!'),
        }).optional())
        .mutation(async ({ ctx, input }) => {
            const payload: PushPayload = {
                title: input?.title || 'Test Notification',
                body: input?.body || 'This is a test notification from Woolet!',
                icon: '/assets/woolet-icon.png',
                badge: '/assets/woolet-icon.png',
                url: '/notifications',
                requireInteraction: true,
            };

            const result = await sendPushNotification(ctx.userId!, payload);
            return result;
        }),

    // Update subscription last used timestamp
    ping: protectedProcedure
        .input(z.object({ endpoint: z.string().url() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(pushSubscriptions)
                .set({ lastUsedAt: new Date(), updatedAt: new Date() })
                .where(and(
                    eq(pushSubscriptions.endpoint, input.endpoint),
                    eq(pushSubscriptions.userId, ctx.userId!)
                ));

            return { success: true };
        }),
});

import { db } from '../db';
