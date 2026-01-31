import { pgTable, text, numeric, timestamp, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { stocks } from './stocks';

export const investmentTransactions = pgTable('investment_transactions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    stockId: text('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'buy' or 'sell'
    date: date('date').notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
    pricePerShare: numeric('price_per_share', { precision: 20, scale: 8 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 20, scale: 8 }).notNull(),
    currency: text('currency').notNull(),
    notes: text('notes'),
    realizedPL: numeric('realized_pl', { precision: 20, scale: 8 }), // For sell transactions
    // NEW: Cash flow tracking
    cashFlow: numeric('cash_flow', { precision: 20, scale: 8 }).notNull().default('0'), // Negative for buy, positive for sell/deposit
    cashBalanceAfter: numeric('cash_balance_after', { precision: 20, scale: 2 }), // Cash balance after this transaction
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const investmentTransactionsRelations = relations(investmentTransactions, ({ one }) => ({
    user: one(users, {
        fields: [investmentTransactions.userId],
        references: [users.id],
    }),
    stock: one(stocks, {
        fields: [investmentTransactions.stockId],
        references: [stocks.id],
    }),
}));

export type InvestmentTransaction = typeof investmentTransactions.$inferSelect;
export type NewInvestmentTransaction = typeof investmentTransactions.$inferInsert;
