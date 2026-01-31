import { pgTable, text, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { relations } from 'drizzle-orm';

export const chatSessions = pgTable('chat_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull().default('New Chat'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('chat_sessions_user_id_idx').on(table.userId),
}));

export const chatMessages = pgTable('chat_messages', {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
    role: text('role').notNull(), // 'user' | 'model'
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    sessionIdIdx: index('chat_messages_session_id_idx').on(table.sessionId),
}));

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
    messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
    session: one(chatSessions, {
        fields: [chatMessages.sessionId],
        references: [chatSessions.id],
    }),
}));
