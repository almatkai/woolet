import { pgTable, text, decimal, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const investmentCashBalances = pgTable('investment_cash_balances', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(),
    availableBalance: decimal('available_balance', { precision: 20, scale: 2 }).notNull().default('0'),
    settledBalance: decimal('settled_balance', { precision: 20, scale: 2 }).notNull().default('0'),
    lastUpdated: timestamp('last_updated').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdCurrencyIdx: {
        name: 'investment_cash_balances_user_id_currency_idx',
        columns: [table.userId, table.currency],
        unique: true,
    },
}));

export const investmentCashBalancesRelations = relations(investmentCashBalances, ({ one }) => ({
    user: one(users, {
        fields: [investmentCashBalances.userId],
        references: [users.id],
    }),
}));

export type InvestmentCashBalance = typeof investmentCashBalances.$inferSelect;
export type NewInvestmentCashBalance = typeof investmentCashBalances.$inferInsert;