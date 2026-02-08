import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const categories = pgTable('categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    type: text('type').default('income').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const categoriesRelations = relations(categories, ({ one }) => ({
    user: one(users, {
        fields: [categories.userId],
        references: [users.id],
    }),
}));

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

// Default system-wide categories (userId = null) with fixed UUIDs
// These must have the same IDs across all environments for import/export to work
export const DEFAULT_CATEGORIES = [
    // Income categories
    { id: '45f0dd51-d5a6-4f0b-898e-f99f6a51e82c', name: 'Scholarships', icon: '🎓', color: '#17A2B8', type: 'income' as const },
    { id: '4f318874-0443-4c84-8cb2-55e0efc01287', name: 'Selling Items', icon: '🛒', color: '#DC3545', type: 'income' as const },
    { id: 'd3709261-062b-4ea3-ba48-bd7289374e48', name: 'Freelance Work', icon: '🖋️', color: '#FF5733', type: 'income' as const },
    { id: 'deab4778-5f33-4a99-baa0-6c0892a93882', name: 'Rental Income', icon: '🏠', color: '#FFC107', type: 'income' as const },
    { id: '199c0a04-80ad-440b-aa46-b195e96180b4', name: 'Savings Interest', icon: '💰', color: '#6610F2', type: 'income' as const },
    { id: 'dc69a927-72cd-40e7-8537-36afb8c44142', name: 'Pension', icon: '🧓', color: '#6C757D', type: 'income' as const },
    { id: 'e7335b45-7aa3-45bc-a21b-f18a40abdae6', name: 'Adjustment', icon: '🔧', color: '#64748b', type: 'income' as const },
    { id: 'a6c92f8f-dda0-4ce7-9ada-bf0b425c10e0', name: 'Debt', icon: '💸', color: '#f43f5e', type: 'income' as const },
    { id: '849eaa5b-1b51-4df9-9003-7ebd7e206392', name: 'Refunds', icon: '💵', color: '#20C997', type: 'income' as const },
    { id: '755a508e-60ed-42fe-9ee8-1af538b235ee', name: 'Salary', icon: '💸', color: '#f43f5e', type: 'income' as const },
    { id: '730be7a8-edc9-4e73-b44f-3040d172278c', name: 'Dividends', icon: '💹', color: '#17A2B8', type: 'income' as const },
    { id: '738c63ba-4b85-4e10-99d3-bf0e155764b0', name: 'Royalties', icon: '🎵', color: '#6F42C1', type: 'income' as const },
    { id: 'f0fadc7b-7cb4-4e9b-bb5a-aeffff2abb9b', name: 'Gifts', icon: '🎁', color: '#E83E8C', type: 'income' as const },
    { id: '67f25e4f-9350-489a-85b8-384613826deb', name: 'Grants', icon: '🎓', color: '#007BFF', type: 'income' as const },
    { id: '9339d123-4874-41b4-a020-9555a98ba7f5', name: 'Bonuses', icon: '🎉', color: '#FD7E14', type: 'income' as const },
    
    // Expense categories
    { id: '68d23473-2b6a-404f-8643-0a2b89ff3d15', name: 'Food', icon: '🍔', color: '#FF6B6B', type: 'expense' as const },
    { id: 'c3c5712a-a9eb-494e-a2b0-131c899ab2fd', name: 'Grocery', icon: '🛒', color: '#007BFF', type: 'expense' as const },
    { id: 'de94facf-c349-4563-b9d4-a43b1de9f516', name: 'Transport', icon: '🚗', color: '#4ECDC4', type: 'expense' as const },
    { id: '714b838b-d58d-42ed-8329-ba50d4d20986', name: 'Entertainment', icon: '🎬', color: '#45B7D1', type: 'expense' as const },
    { id: '47d55bd9-0d2b-40b2-a660-af0cf2598c99', name: 'Shopping', icon: '🛒', color: '#96CEB4', type: 'expense' as const },
    { id: '9be6d9e2-43c1-44ee-8e89-aed31958ca90', name: 'Bills', icon: '📄', color: '#FFEAA7', type: 'expense' as const },
    { id: '0db8b29f-b7cc-4595-9349-c34125ea0b1f', name: 'Health', icon: '🏥', color: '#DDA0DD', type: 'expense' as const },
    { id: '7107b00a-3cce-433d-9445-b9300accae02', name: 'Education', icon: '📚', color: '#98D8C8', type: 'expense' as const },
    { id: 'd2fe4af8-822a-48b4-b670-e40967d40a85', name: 'Unknown', icon: '❓', color: '#95A5A6', type: 'expense' as const },
    { id: '6b385201-a7c6-40e1-b68d-f16050fed346', name: 'Other', icon: '📦', color: '#BDC3C7', type: 'expense' as const },
    { id: '90e484eb-60d6-4bea-9bde-242539f7605e', name: 'Mortgage', icon: '🏠', color: '#8B4513', type: 'expense' as const },
];
