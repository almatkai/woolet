import { pgTable, text, uuid, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    
    // Web Push subscription data
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    
    // Browser info
    browserName: text('browser_name'), // 'chrome', 'firefox', 'safari', etc.
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('push_subscriptions_user_id_idx').on(table.userId),
    endpointIdx: index('push_subscriptions_endpoint_idx').on(table.endpoint),
    activeIdx: index('push_subscriptions_active_idx').on(table.userId, table.isActive),
}));

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
