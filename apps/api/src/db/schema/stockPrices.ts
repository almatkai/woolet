import { pgTable, text, date, numeric, index } from 'drizzle-orm/pg-core';
import { stocks } from './stocks';

export const stockPrices = pgTable('stock_prices', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    stockId: text('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    open: numeric('open', { precision: 20, scale: 8 }).notNull(),
    high: numeric('high', { precision: 20, scale: 8 }).notNull(),
    low: numeric('low', { precision: 20, scale: 8 }).notNull(),
    close: numeric('close', { precision: 20, scale: 8 }).notNull(),
    adjustedClose: numeric('adjusted_close', { precision: 20, scale: 8 }).notNull(),
    volume: numeric('volume', { precision: 20, scale: 0 }),
}, (table) => ({
    stockDateIdx: index('stock_prices_stock_date_idx').on(table.stockId, table.date),
}));

export type StockPrice = typeof stockPrices.$inferSelect;
export type NewStockPrice = typeof stockPrices.$inferInsert;
