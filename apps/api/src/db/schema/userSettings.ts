import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core';

export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().unique(),
  defaultCurrency: text('default_currency').notNull().default('USD'),
  // Global payment status logic (applies to all unless overridden)
  paymentStatusLogic: text('payment_status_logic').notNull().default('monthly'), // 'monthly' or 'period'
  paymentStatusPeriod: text('payment_status_period').notNull().default('15'), // days

  // Per-type overrides (null = use global)
  creditStatusLogic: text('credit_status_logic'),
  creditStatusPeriod: text('credit_status_period'),
  mortgageStatusLogic: text('mortgage_status_logic'),
  mortgageStatusPeriod: text('mortgage_status_period'),
  subscriptionStatusLogic: text('subscription_status_logic'),
  subscriptionStatusPeriod: text('subscription_status_period'),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  browserNotificationsEnabled: boolean('browser_notifications_enabled').notNull().default(true),
  emailNotificationsEnabled: boolean('email_notifications_enabled').notNull().default(false),
  emailNotificationAddress: text('email_notification_address'),
  subscriptionReminderDays: integer('subscription_reminder_days').notNull().default(3),
  creditReminderDays: integer('credit_reminder_days').notNull().default(3),
  mortgageReminderDays: integer('mortgage_reminder_days').notNull().default(3),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
