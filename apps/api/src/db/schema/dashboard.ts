import { pgTable, text, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const dashboardLayouts = pgTable('dashboard_layouts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    layout: jsonb('layout').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const dashboardLayoutsRelations = relations(dashboardLayouts, ({ one }) => ({
    user: one(users, {
        fields: [dashboardLayouts.userId],
        references: [users.id],
    }),
}));

export type DashboardLayout = typeof dashboardLayouts.$inferSelect;
export type NewDashboardLayout = typeof dashboardLayouts.$inferInsert;
