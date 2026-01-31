import { pgTable, text, uuid, timestamp, decimal, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { accounts } from './accounts';
import { currencies } from './currencies';

export const currencyBalances = pgTable('currency_balances', {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
    currencyCode: text('currency_code').references(() => currencies.code).notNull(),
    balance: decimal('balance', { precision: 14, scale: 2 }).default('0').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    accountIdIdx: index('currency_balances_account_id_idx').on(table.accountId),
    uniqueAccountCurrency: unique('currency_balances_account_currency_unique').on(table.accountId, table.currencyCode),
}));

import { transactions } from './transactions';
import { debts } from './debts';

export const currencyBalancesRelations = relations(currencyBalances, ({ one, many }) => ({
    account: one(accounts, {
        fields: [currencyBalances.accountId],
        references: [accounts.id],
    }),
    currency: one(currencies, {
        fields: [currencyBalances.currencyCode],
        references: [currencies.code],
    }),
    transactions: many(transactions),
    debts: many(debts),
}));

export type CurrencyBalance = typeof currencyBalances.$inferSelect;
export type NewCurrencyBalance = typeof currencyBalances.$inferInsert;
