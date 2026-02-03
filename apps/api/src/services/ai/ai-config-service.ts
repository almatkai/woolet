import { db } from '../../db';
import { aiConfig, type AiConfig, defaultAiConfig, type AiProvider } from '../../db/schema';
import { eq } from 'drizzle-orm';

function toAiConfig(dbConfig: AiConfig): AiConfig {
  return {
    ...dbConfig,
    providerOrder: dbConfig.providerOrder as AiProvider[],
    modelSettings: dbConfig.modelSettings as AiConfig['modelSettings'],
  };
}

export class AiConfigService {
  /**
   * Get the current AI configuration from the database
   * Falls back to default configuration if not found
   */
  static async getConfig(): Promise<AiConfig> {
    const config = await db.query.aiConfig.findFirst({
      where: eq(aiConfig.id, 'default'),
    });

    if (config) {
      return toAiConfig(config as AiConfig);
    }

    // Fallback to default with proper dates
    return {
      ...defaultAiConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AiConfig;
  }

  /**
   * Update the AI configuration
   */
  static async updateConfig(updates: Partial<AiConfig>): Promise<AiConfig> {
    const result = await db
      .update(aiConfig)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(aiConfig.id, 'default'))
      .returning();

    if (result.length > 0) {
      return toAiConfig(result[0] as AiConfig);
    }

    // If no config exists, insert the default with updates
    const newConfig = await db
      .insert(aiConfig)
      .values({
        ...defaultAiConfig,
        ...updates,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return toAiConfig(newConfig[0] as AiConfig);
  }

  /**
   * Reset to default configuration
   */
  static async resetToDefault(): Promise<AiConfig> {
    const result = await db
      .update(aiConfig)
      .set({
        ...defaultAiConfig,
        updatedAt: new Date(),
      })
      .where(eq(aiConfig.id, 'default'))
      .returning();

    if (result.length > 0) {
      return toAiConfig(result[0] as AiConfig);
    }

    // If no config exists, insert the default
    const newConfig = await db
      .insert(aiConfig)
      .values({
        ...defaultAiConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return toAiConfig(newConfig[0] as AiConfig);
  }

  /**
   * Check if the AI config table exists and has data
   */
  static async hasConfig(): Promise<boolean> {
    const config = await db.query.aiConfig.findFirst({
      where: eq(aiConfig.id, 'default'),
    });

    return !!config;
  }

  /**
   * Ensure the default configuration exists
   */
  static async ensureDefaultConfig(): Promise<AiConfig> {
    const exists = await this.hasConfig();
    if (exists) {
      return this.getConfig();
    }

    const newConfig = await db
      .insert(aiConfig)
      .values({
        ...defaultAiConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return toAiConfig(newConfig[0] as AiConfig);
  }
}
