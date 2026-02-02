import { pgTable, text, uuid, timestamp, decimal, date, index, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { currencyBalances } from './currency-balances';
import { categories } from './categories';
import { debts, debtPayments } from './debts';
import { transactionSplits } from './split-bills';

export const transactions = pgTable('transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    currencyBalanceId: uuid('currency_balance_id').references(() => currencyBalances.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    fee: decimal('fee', { precision: 12, scale: 2 }).default('0').notNull(),
    exchangeRate: decimal('exchange_rate', { precision: 12, scale: 6 }).default('1').notNull(),
    cashbackAmount: decimal('cashback_amount', { precision: 12, scale: 2 }).default('0'),
    toAmount: decimal('to_amount', { precision: 12, scale: 2 }),
    description: text('description'),
    date: date('date').notNull(),
    type: text('type').notNull(), // 'income', 'expense', 'transfer'
    lifecycleStatus: text('lifecycle_status').default('active').notNull(), // 'active', 'deleting'
    toCurrencyBalanceId: uuid('to_currency_balance_id').references(() => currencyBalances.id),
    debtPaymentId: uuid('debt_payment_id').references(() => debtPayments.id, { onDelete: 'cascade' }),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }),
    excludeFromMonthlyStats: boolean('exclude_from_monthly_stats').default(false).notNull(),
    parentTransactionId: uuid('parent_transaction_id'), // Self-reference for linked transactions
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    currencyBalanceIdIdx: index('transactions_currency_balance_id_idx').on(table.currencyBalanceId),
    dateIdx: index('transactions_date_idx').on(table.date),
    debtPaymentIdIdx: index('transactions_debt_payment_id_idx').on(table.debtPaymentId),
    debtIdIdx: index('transactions_debt_id_idx').on(table.debtId),
    parentTransactionIdIdx: index('transactions_parent_transaction_id_idx').on(table.parentTransactionId),
    idempotencyKeyIdx: index('transactions_idempotency_key_idx').on(table.idempotencyKey),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
    currencyBalance: one(currencyBalances, {
        fields: [transactions.currencyBalanceId],
        references: [currencyBalances.id],
    }),
    toCurrencyBalance: one(currencyBalances, {
        fields: [transactions.toCurrencyBalanceId],
        references: [currencyBalances.id],
    }),
    category: one(categories, {
        fields: [transactions.categoryId],
        references: [categories.id],
    }),
    debtPayment: one(debtPayments, {
        fields: [transactions.debtPaymentId],
        references: [debtPayments.id],
    }),
    debt: one(debts, {
        fields: [transactions.debtId],
        references: [debts.id],
    }),
    parentTransaction: one(transactions, {
        fields: [transactions.parentTransactionId],
        references: [transactions.id],
        relationName: 'linked_transactions',
    }),
    childTransactions: many(transactions, {
        relationName: 'linked_transactions',
    }),
    splits: many(transactionSplits),
}));

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
