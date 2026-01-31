import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const widgetMetadata = pgTable('widget_metadata', {
    id: text('id').primaryKey(), // Widget ID (e.g., 'currencyExchange', 'investmentPortfolio')
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    version: text('version').default('1.0.0').notNull(),
});

export type WidgetMetadata = typeof widgetMetadata.$inferSelect;
export type NewWidgetMetadata = typeof widgetMetadata.$inferInsert;
