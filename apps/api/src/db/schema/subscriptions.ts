import { pgTable, text, uuid, timestamp, decimal, date, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { credits, mortgages } from './financial-products';

// Subscriptions - periodic payments not tied to a specific account
export const subscriptions = pgTable('subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'mobile' | 'general' | 'credit' | 'mortgage'
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    frequency: text('frequency').notNull().default('monthly'), // 'daily' | 'weekly' | 'monthly' | 'yearly'
    billingDay: integer('billing_day').default(1), // Day of month (1-31) for monthly, or day of week (1-7) for weekly
    startDate: date('start_date').notNull(),
    endDate: date('end_date'), // null = ongoing
    status: text('status').default('active').notNull(), // 'active' | 'paused' | 'cancelled'
    icon: text('icon').default('📱'),
    color: text('color').default('#6366f1'), // Default indigo color
    description: text('description'),
    // Optional link to existing credit or mortgage
    linkedEntityId: uuid('linked_entity_id'),
    linkedEntityType: text('linked_entity_type'), // 'credit' | 'mortgage' | null
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
    typeIdx: index('subscriptions_type_idx').on(table.type),
    statusIdx: index('subscriptions_status_idx').on(table.status),
}));

// Relations defined in subscription-payments.ts to avoid circular imports

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

