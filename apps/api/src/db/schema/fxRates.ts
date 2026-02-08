import { pgTable, text, date, numeric, index, timestamp } from 'drizzle-orm/pg-core';

export const fxRates = pgTable('fx_rates', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    date: date('date').notNull(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    rate: numeric('rate', { precision: 20, scale: 8 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    // Index for querying historical rates by date and currency pair
    dateFromToIdx: index('fx_rates_date_from_to_idx').on(table.date, table.fromCurrency, table.toCurrency),
    // Index for querying latest rates by currency
    toCurrencyDateIdx: index('fx_rates_to_currency_date_idx').on(table.toCurrency, table.date.desc()),
    // Index for time-series queries
    createdAtIdx: index('fx_rates_created_at_idx').on(table.createdAt.desc()),
}));

export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
