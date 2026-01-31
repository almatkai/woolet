import { pgTable, text, uuid, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptions } from './subscriptions';
import { currencyBalances } from './currency-balances';
import { transactions } from './transactions';
import { users } from './users';
import { credits, mortgages } from './financial-products';

// Subscription payments - tracks each payment made for a subscription
export const subscriptionPayments = pgTable('subscription_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
    currencyBalanceId: uuid('currency_balance_id').references(() => currencyBalances.id, { onDelete: 'set null' }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    dueDate: timestamp('due_date'), // When was this payment due
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    subscriptionIdIdx: index('subscription_payments_subscription_id_idx').on(table.subscriptionId),
    paidAtIdx: index('subscription_payments_paid_at_idx').on(table.paidAt),
    currencyBalanceIdIdx: index('subscription_payments_currency_balance_id_idx').on(table.currencyBalanceId),
}));

// Relations for subscriptions (defined here to avoid circular imports)
export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
    user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
    payments: many(subscriptionPayments),
    linkedCredit: one(credits, { fields: [subscriptions.linkedEntityId], references: [credits.id] }),
    linkedMortgage: one(mortgages, { fields: [subscriptions.linkedEntityId], references: [mortgages.id] }),
}));

export const subscriptionPaymentsRelations = relations(subscriptionPayments, ({ one }) => ({
    subscription: one(subscriptions, {
        fields: [subscriptionPayments.subscriptionId],
        references: [subscriptions.id],
    }),
    currencyBalance: one(currencyBalances, {
        fields: [subscriptionPayments.currencyBalanceId],
        references: [currencyBalances.id],
    }),
    transaction: one(transactions, {
        fields: [subscriptionPayments.transactionId],
        references: [transactions.id],
    }),
}));

export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;
export type NewSubscriptionPayment = typeof subscriptionPayments.$inferInsert;

