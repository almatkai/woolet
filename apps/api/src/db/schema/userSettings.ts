import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().unique(),
  defaultCurrency: text('default_currency').notNull().default('USD'),
  mortgageStatusLogic: text('mortgage_status_logic').notNull().default('monthly'), // 'monthly' or 'period'
  mortgageStatusPeriod: text('mortgage_status_period').notNull().default('15'), // days
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
