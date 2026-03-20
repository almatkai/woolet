import { pgTable, text, uuid, timestamp, decimal, date, index, boolean, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { currencyBalances } from './currency-balances';
import { transactions } from './transactions';
import { users } from './users';

export const debts = pgTable('debts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // Nullable for migration
    currencyBalanceId: uuid('currency_balance_id').references(() => currencyBalances.id, { onDelete: 'cascade' }),
    currencyCode: text('currency_code'),
    personName: text('person_name').notNull(),
    linkedUserId: text('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
    personContact: text('person_contact'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidAmount: decimal('paid_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    type: text('type').notNull(), // 'i_owe', 'they_owe'
    description: text('description'),
    isTest: boolean('is_test').default(false).notNull(),
    dueDate: date('due_date'),
    status: text('status').default('pending').notNull(), // 'pending', 'partial', 'paid'
    lifecycleStatus: text('lifecycle_status').default('active').notNull(), // 'active', 'deleting'
    imgUrl: text('img_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    currencyBalanceIdIdx: index('debts_currency_balance_id_idx').on(table.currencyBalanceId),
    statusIdx: index('debts_status_idx').on(table.status),
    userIdIdx: index('debts_user_id_idx').on(table.userId),
    linkedUserIdIdx: index('debts_linked_user_id_idx').on(table.linkedUserId),
}));

export const debtPayments = pgTable('debt_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    note: text('note'),
    /** posted = applied; awaiting_peer = linked debt, waiting for counterparty account + confirm */
    syncStatus: text('sync_status').notNull().default('posted'),
    proposedByUserId: text('proposed_by_user_id'),
    proposerDistributions: jsonb('proposer_distributions').$type<
        { currencyBalanceId: string; amount: number }[] | null
    >(),
    syncGroupId: uuid('sync_group_id'),
});

export const debtsRelations = relations(debts, ({ one, many }) => ({
    currencyBalance: one(currencyBalances, {
        fields: [debts.currencyBalanceId],
        references: [currencyBalances.id],
    }),
    user: one(users, {
        fields: [debts.userId],
        references: [users.id],
    }),
    linkedUser: one(users, {
        fields: [debts.linkedUserId],
        references: [users.id],
    }),
    payments: many(debtPayments),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one, many }) => ({
    debt: one(debts, {
        fields: [debtPayments.debtId],
        references: [debts.id],
    }),
    transactions: many(transactions),
}));

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
export type DebtPayment = typeof debtPayments.$inferSelect;
export type NewDebtPayment = typeof debtPayments.$inferInsert;
