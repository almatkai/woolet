import { pgTable, text, uuid, timestamp, decimal, date, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { accounts } from './accounts';

// Credits (loans)
export const credits = pgTable('credits', {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    principalAmount: decimal('principal_amount', { precision: 12, scale: 2 }).notNull(),
    interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(),
    monthlyPayment: decimal('monthly_payment', { precision: 12, scale: 2 }).notNull(),
    remainingBalance: decimal('remaining_balance', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: text('status').default('active').notNull(), // 'active', 'paid_off', 'defaulted'
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Mortgages
export const mortgages = pgTable('mortgages', {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
    propertyName: text('property_name').notNull(),
    propertyAddress: text('property_address'),
    principalAmount: decimal('principal_amount', { precision: 14, scale: 2 }).notNull(),
    interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(),
    monthlyPayment: decimal('monthly_payment', { precision: 12, scale: 2 }).notNull(),
    remainingBalance: decimal('remaining_balance', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    termYears: integer('term_years').notNull(),
    paymentDay: integer('payment_day').default(1), // Day of month when payment is due (1-31)
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Deposits (savings accounts)
export const deposits = pgTable('deposits', {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
    bankName: text('bank_name').notNull(),
    depositName: text('deposit_name').notNull(),
    principalAmount: decimal('principal_amount', { precision: 14, scale: 2 }).notNull(),
    currentBalance: decimal('current_balance', { precision: 14, scale: 2 }).notNull(),
    interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(),
    compoundingFrequency: text('compounding_frequency').default('monthly').notNull(),
    currency: text('currency').notNull(),
    startDate: date('start_date').notNull(),
    maturityDate: date('maturity_date'),
    isFlexible: boolean('is_flexible').default(true).notNull(),
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
import { creditPayments } from './credit-payments';
import { mortgagePayments } from './mortgage-payments';

export const creditsRelations = relations(credits, ({ one, many }) => ({
    account: one(accounts, { fields: [credits.accountId], references: [accounts.id] }),
    payments: many(creditPayments),
}));

export const mortgagesRelations = relations(mortgages, ({ one, many }) => ({
    account: one(accounts, { fields: [mortgages.accountId], references: [accounts.id] }),
    payments: many(mortgagePayments),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
    account: one(accounts, { fields: [deposits.accountId], references: [accounts.id] }),
}));

export type Credit = typeof credits.$inferSelect;
export type NewCredit = typeof credits.$inferInsert;
export type Mortgage = typeof mortgages.$inferSelect;
export type NewMortgage = typeof mortgages.$inferInsert;
export type Deposit = typeof deposits.$inferSelect;
export type NewDeposit = typeof deposits.$inferInsert;
