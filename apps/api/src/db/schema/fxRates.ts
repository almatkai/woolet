import { pgTable, text, date, numeric, index } from 'drizzle-orm/pg-core';

export const fxRates = pgTable('fx_rates', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    date: date('date').notNull(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    rate: numeric('rate', { precision: 20, scale: 8 }).notNull(),
}, (table) => ({
    dateFromToIdx: index('fx_rates_date_from_to_idx').on(table.date, table.fromCurrency, table.toCurrency),
}));

export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
