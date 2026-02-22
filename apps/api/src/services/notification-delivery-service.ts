import { eq } from 'drizzle-orm';
import { db } from '../db';
import { userSettings, users } from '../db/schema';
import { sendPushNotification } from './push-notification-service';
import { sendEmailNotification } from './email-notification-service';

function isEmailDeliveryEnabled(): boolean {
    return process.env.ENABLE_SMTP_NOTIFICATIONS === 'true';
}

export interface ChannelNotificationPayload {
    userId: string;
    title: string;
    message: string;
    url?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    forcePush?: boolean;
}

export async function deliverNotificationChannels(payload: ChannelNotificationPayload) {
    const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, payload.userId),
    });

    const notificationsEnabled = settings?.notificationsEnabled ?? true;
    if (!notificationsEnabled) {
        return { pushSent: 0, emailSent: false, skipped: true };
    }

    let pushSent = 0;
    let emailSent = false;

    if ((settings?.browserNotificationsEnabled ?? true) || payload.forcePush) {
        try {
            const pushResult = await sendPushNotification(payload.userId, {
                title: payload.title,
                body: payload.message,
                url: payload.url,
                requireInteraction: payload.priority === 'high' || payload.priority === 'urgent',
                data: {
                    entityType: payload.entityType,
                    entityId: payload.entityId,
                    ...payload.metadata,
                },
            });
            pushSent = pushResult.success;
        } catch (error) {
            console.error('Failed to send push notification:', error);
        }
    }

    if (isEmailDeliveryEnabled() && settings?.emailNotificationsEnabled) {
        const user = await db.query.users.findFirst({
            where: eq(users.id, payload.userId),
        });

        const recipient = settings.emailNotificationAddress || user?.email;
        if (recipient) {
            emailSent = await sendEmailNotification({
                to: recipient,
                subject: payload.title,
                text: `${payload.message}${payload.url ? `\n\nOpen: ${payload.url}` : ''}`,
                html: `<p>${payload.message}</p>${payload.url ? `<p><a href="${payload.url}">Open in Woolet</a></p>` : ''}`,
            });
        }
    }

    return { pushSent, emailSent, skipped: false };
}
