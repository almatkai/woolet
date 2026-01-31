import { pgTable, text, uuid, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { accounts } from './accounts';

export const banks = pgTable('banks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(), // Kaspi, Halyk, Chase
    icon: text('icon'), // emoji or icon identifier
    color: text('color'), // hex color for UI
    isTest: boolean('is_test').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('banks_user_id_idx').on(table.userId),
}));

export const banksRelations = relations(banks, ({ one, many }) => ({
    user: one(users, {
        fields: [banks.userId],
        references: [users.id],
    }),
    accounts: many(accounts),
}));

export type Bank = typeof banks.$inferSelect;
export type NewBank = typeof banks.$inferInsert;
