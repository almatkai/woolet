import { pgTable, text, uuid, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { mortgages } from './financial-products';

// Mortgage payments track which months have been paid for a mortgage
export const mortgagePayments = pgTable('mortgage_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    mortgageId: uuid('mortgage_id').references(() => mortgages.id, { onDelete: 'cascade' }).notNull(),
    monthYear: text('month_year').notNull(), // Format: "YYYY-MM" e.g., "2026-01"
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    note: text('note'),
}, (table) => ({
    mortgageIdIdx: index('mortgage_payments_mortgage_id_idx').on(table.mortgageId),
    monthYearIdx: index('mortgage_payments_month_year_idx').on(table.monthYear),
}));

export const mortgagePaymentsRelations = relations(mortgagePayments, ({ one }) => ({
    mortgage: one(mortgages, {
        fields: [mortgagePayments.mortgageId],
        references: [mortgages.id],
    }),
}));

export type MortgagePayment = typeof mortgagePayments.$inferSelect;
export type NewMortgagePayment = typeof mortgagePayments.$inferInsert;
