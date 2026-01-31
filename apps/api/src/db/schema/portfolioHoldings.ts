import { pgTable, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { stocks } from './stocks';

export const portfolioHoldings = pgTable('portfolio_holdings', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    stockId: text('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
    averageCostBasis: numeric('average_cost_basis', { precision: 20, scale: 8 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const portfolioHoldingsRelations = relations(portfolioHoldings, ({ one }) => ({
    user: one(users, {
        fields: [portfolioHoldings.userId],
        references: [users.id],
    }),
    stock: one(stocks, {
        fields: [portfolioHoldings.stockId],
        references: [stocks.id],
    }),
}));

export type PortfolioHolding = typeof portfolioHoldings.$inferSelect;
export type NewPortfolioHolding = typeof portfolioHoldings.$inferInsert;
