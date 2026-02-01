import { pgTable, uuid, text, integer, date, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const aiUsage = pgTable('ai_usage', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    questionCountToday: integer('question_count_today').default(0).notNull(),
    questionCountLifetime: integer('question_count_lifetime').default(0).notNull(),
    lastResetDate: date('last_reset_date').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type AIUsage = typeof aiUsage.$inferSelect;
export type NewAIUsage = typeof aiUsage.$inferInsert;
