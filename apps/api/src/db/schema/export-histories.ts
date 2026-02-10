import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const exportHistories = pgTable('export_histories', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export type ExportHistory = typeof exportHistories.$inferSelect;
export type NewExportHistory = typeof exportHistories.$inferInsert;
