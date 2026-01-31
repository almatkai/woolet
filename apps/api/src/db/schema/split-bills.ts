import { pgTable, text, uuid, timestamp, decimal, boolean, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { transactions } from './transactions';
import { users } from './users';
import { currencyBalances } from './currency-balances';

// Enum for contact type (telegram, whatsapp, phone, email)
export const contactTypeEnum = pgEnum('contact_type', ['telegram', 'whatsapp', 'phone', 'email', 'other']);

// Enum for split status
export const splitStatusEnum = pgEnum('split_status', ['pending', 'partial', 'settled']);

/**
 * Split Participants - people who you split bills with
 * These are contacts you can tag on transactions
 */
export const splitParticipants = pgTable('split_participants', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    // Contact information for notifications
    contactType: contactTypeEnum('contact_type'),
    contactValue: text('contact_value'), // phone number, telegram username, etc.
    // Optional avatar/color for UI
    color: text('color').default('#8b5cf6'),
    // Soft delete
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('split_participants_user_id_idx').on(table.userId),
}));

export const splitParticipantsRelations = relations(splitParticipants, ({ one, many }) => ({
    user: one(users, {
        fields: [splitParticipants.userId],
        references: [users.id],
    }),
    transactionSplits: many(transactionSplits),
}));

/**
 * Transaction Splits - links a transaction with participants who owe money
 * Each split represents one person's share of a transaction
 */
export const transactionSplits = pgTable('transaction_splits', {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
    participantId: uuid('participant_id').references(() => splitParticipants.id, { onDelete: 'cascade' }).notNull(),
    // The amount this participant owes
    owedAmount: decimal('owed_amount', { precision: 12, scale: 2 }).notNull(),
    // The amount that has been paid back
    paidAmount: decimal('paid_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    // Status: pending, partial, settled
    status: splitStatusEnum('status').default('pending').notNull(),
    // Optional note for this specific split
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    transactionIdIdx: index('transaction_splits_transaction_id_idx').on(table.transactionId),
    participantIdIdx: index('transaction_splits_participant_id_idx').on(table.participantId),
    statusIdx: index('transaction_splits_status_idx').on(table.status),
}));

export const transactionSplitsRelations = relations(transactionSplits, ({ one, many }) => ({
    transaction: one(transactions, {
        fields: [transactionSplits.transactionId],
        references: [transactions.id],
    }),
    participant: one(splitParticipants, {
        fields: [transactionSplits.participantId],
        references: [splitParticipants.id],
    }),
    payments: many(splitPayments),
}));

/**
 * Split Payments - records when someone pays back their share
 * Supports partial payments and tracks which account received the money
 */
export const splitPayments = pgTable('split_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    splitId: uuid('split_id').references(() => transactionSplits.id, { onDelete: 'cascade' }).notNull(),
    // The amount paid in this payment
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    // Optional: which currency balance received this payment
    receivedToCurrencyBalanceId: uuid('received_to_currency_balance_id').references(() => currencyBalances.id, { onDelete: 'set null' }),
    // Optional: link to the income transaction created for this payment
    linkedTransactionId: uuid('linked_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    // Payment date
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    splitIdIdx: index('split_payments_split_id_idx').on(table.splitId),
}));

export const splitPaymentsRelations = relations(splitPayments, ({ one }) => ({
    split: one(transactionSplits, {
        fields: [splitPayments.splitId],
        references: [transactionSplits.id],
    }),
    receivedToCurrencyBalance: one(currencyBalances, {
        fields: [splitPayments.receivedToCurrencyBalanceId],
        references: [currencyBalances.id],
    }),
    linkedTransaction: one(transactions, {
        fields: [splitPayments.linkedTransactionId],
        references: [transactions.id],
    }),
}));

// Types
export type SplitParticipant = typeof splitParticipants.$inferSelect;
export type NewSplitParticipant = typeof splitParticipants.$inferInsert;

export type TransactionSplit = typeof transactionSplits.$inferSelect;
export type NewTransactionSplit = typeof transactionSplits.$inferInsert;

export type SplitPayment = typeof splitPayments.$inferSelect;
export type NewSplitPayment = typeof splitPayments.$inferInsert;
