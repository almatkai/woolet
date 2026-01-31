import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

export const stocks = pgTable('stocks', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull(), // USD, EUR, KZT, etc.
    exchange: text('exchange'), // NYSE, NASDAQ, LSE, KASE
    isManual: boolean('is_manual').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Stock = typeof stocks.$inferSelect;
export type NewStock = typeof stocks.$inferInsert;
