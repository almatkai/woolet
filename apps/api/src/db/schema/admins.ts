import { pgTable, text } from 'drizzle-orm/pg-core';

export const admins = pgTable('admins', {
    id: text('id').primaryKey(), // Clerk user ID
});

export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
