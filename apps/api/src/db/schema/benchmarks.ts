import { pgTable, text, date, numeric, timestamp, index } from 'drizzle-orm/pg-core';

export const benchmarks = pgTable('benchmarks', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    ticker: text('ticker').notNull().unique(),
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const benchmarkPrices = pgTable('benchmark_prices', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    benchmarkId: text('benchmark_id').notNull().references(() => benchmarks.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    close: numeric('close', { precision: 20, scale: 8 }).notNull(),
}, (table) => ({
    benchmarkDateIdx: index('benchmark_prices_benchmark_date_idx').on(table.benchmarkId, table.date),
}));

export type Benchmark = typeof benchmarks.$inferSelect;
export type NewBenchmark = typeof benchmarks.$inferInsert;
export type BenchmarkPrice = typeof benchmarkPrices.$inferSelect;
export type NewBenchmarkPrice = typeof benchmarkPrices.$inferInsert;
