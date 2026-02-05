import { pgTable, text, uuid, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export type NotificationType = 
    | 'subscription_due'
    | 'subscription_overdue'
    | 'subscription_paid'
    | 'payment_reminder'
    | 'budget_alert'
    | 'spending_anomaly'
    | 'investment_update'
    | 'credit_limit'
    | 'debt_reminder'
    | 'general';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export const notifications = pgTable('notifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(), // NotificationType
    title: text('title').notNull(),
    message: text('message').notNull(),
    priority: text('priority').default('medium').notNull(), // NotificationPriority
    
    // Flexible redirect links for different platforms
    links: jsonb('links').$type<{
        web?: string;      // Web route path (e.g., "/subscriptions")
        mobile?: string;   // Mobile deep link (e.g., "woolet://subscriptions")
        universal?: string; // Universal link or fallback
    }>().default({}),
    
    // Reference to related entities
    entityType: text('entity_type'), // 'subscription' | 'credit' | 'mortgage' | 'transaction' | etc.
    entityId: text('entity_id'), // ID of the related entity
    
    // Additional metadata
    metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
    
    // Status
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at'),
    
    // Action status (for actionable notifications)
    actionTaken: boolean('action_taken').default(false),
    actionTakenAt: timestamp('action_taken_at'),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('notifications_user_id_idx').on(table.userId),
    userUnreadIdx: index('notifications_user_unread_idx').on(table.userId, table.isRead),
    createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
    entityIdx: index('notifications_entity_idx').on(table.entityType, table.entityId),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
