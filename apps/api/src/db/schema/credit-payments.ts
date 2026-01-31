import { pgTable, text, uuid, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { credits } from './financial-products';

// Credit payments track which months have been paid for a credit/loan
export const creditPayments = pgTable('credit_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    creditId: uuid('credit_id').references(() => credits.id, { onDelete: 'cascade' }).notNull(),
    monthYear: text('month_year').notNull(), // Format: "YYYY-MM" e.g., "2026-01"
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    note: text('note'),
}, (table) => ({
    creditIdIdx: index('credit_payments_credit_id_idx').on(table.creditId),
    monthYearIdx: index('credit_payments_month_year_idx').on(table.monthYear),
}));

export const creditPaymentsRelations = relations(creditPayments, ({ one }) => ({
    credit: one(credits, {
        fields: [creditPayments.creditId],
        references: [credits.id],
    }),
}));

export type CreditPayment = typeof creditPayments.$inferSelect;
export type NewCreditPayment = typeof creditPayments.$inferInsert;
