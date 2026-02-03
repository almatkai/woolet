import { pgTable, text, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core';

export interface ModelSettings {
  openrouter?: { model: string; enabled: boolean };
  openai?: { model: string; enabled: boolean };
  groq?: { model: string; enabled: boolean };
  gemini?: { model: string; enabled: boolean };
}

export const aiConfig = pgTable('ai_config', {
  id: text('id').primaryKey().notNull().default('default'),
  providerOrder: jsonb('provider_order').notNull(),
  defaultProvider: text('default_provider'),
  modelSettings: jsonb('model_settings').notNull(),
  fallbackEnabled: boolean('fallback_enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Default configuration
export const defaultAiConfig = {
  id: 'default',
  providerOrder: ['openrouter', 'groq', 'openai', 'gemini'],
  defaultProvider: 'openrouter',
  modelSettings: {
    openrouter: { model: 'openrouter/auto', enabled: true },
    openai: { model: 'gpt-4o-mini', enabled: true },
    groq: { model: 'llama-3.1-8b-instant', enabled: true },
    gemini: { model: 'gemini-1.5-flash', enabled: true },
  },
  fallbackEnabled: true,
};

export type AiConfig = typeof aiConfig.$inferSelect & {
  providerOrder: AiProvider[];
  modelSettings: ModelSettings;
};
export type AiConfigInsert = typeof aiConfig.$inferInsert & {
  providerOrder?: AiProvider[];
  modelSettings?: ModelSettings;
};

export type AiProvider = 'openrouter' | 'openai' | 'gemini' | 'groq';
