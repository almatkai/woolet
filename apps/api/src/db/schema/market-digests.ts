import { pgTable, uuid, text, date, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const marketDigests = pgTable('market_digests', (t) => ({
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    digestDate: date('digest_date').notNull(),
    kind: text('kind').default('daily').notNull(),
    specs: text('specs'),
    specsHash: text('specs_hash'),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}), (table) => {
    return {
        userDateKindIdx: index('market_digests_user_date_kind_idx').on(table.userId, table.digestDate, table.kind),
        userDateSpecsIdx: index('market_digests_user_date_specs_idx').on(table.userId, table.digestDate, table.specsHash),
    };
});

export type MarketDigest = typeof marketDigests.$inferSelect;
export type NewMarketDigest = typeof marketDigests.$inferInsert;
