import { pgTable, text, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { banks } from './banks';

export const accounts = pgTable('accounts', {
    id: uuid('id').defaultRandom().primaryKey(),
    bankId: uuid('bank_id').references(() => banks.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(), // Main Card, Savings, Investment
    type: text('type').notNull(), // 'checking', 'savings', 'card', 'crypto', 'investment'
    icon: text('icon'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    bankIdIdx: index('accounts_bank_id_idx').on(table.bankId),
}));

import { currencyBalances } from './currency-balances';

export const accountsRelations = relations(accounts, ({ one, many }) => ({
    bank: one(banks, {
        fields: [accounts.bankId],
        references: [banks.id],
    }),
    currencyBalances: many(currencyBalances),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
