import { z } from 'zod';
import { protectedProcedure, router } from '../lib/trpc';
import { db } from '../db';
import { userSettings } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

export const settingsRouter = router({
  getUserSettings: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // Get or create user settings
    const [existingSettings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    // Create default settings if not exists
    if (!existingSettings) {
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId,
          defaultCurrency: 'USD',
          mortgageStatusLogic: 'monthly',
          mortgageStatusPeriod: '15',
        })
        .returning();
      return newSettings;
    }

    return existingSettings;
  }),

  updateUserSettings: protectedProcedure
    .input(
      z.object({
        defaultCurrency: z.string().optional(),
        mortgageStatusLogic: z.string().optional(),
        mortgageStatusPeriod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      // Update or insert settings
      const [updated] = await db
        .insert(userSettings)
        .values({
          userId,
          defaultCurrency: input.defaultCurrency || 'USD',
          mortgageStatusLogic: input.mortgageStatusLogic || 'monthly',
          mortgageStatusPeriod: input.mortgageStatusPeriod || '15',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: {
            ...(input.defaultCurrency ? { defaultCurrency: input.defaultCurrency } : {}),
            ...(input.mortgageStatusLogic ? { mortgageStatusLogic: input.mortgageStatusLogic } : {}),
            ...(input.mortgageStatusPeriod ? { mortgageStatusPeriod: input.mortgageStatusPeriod } : {}),
            updatedAt: new Date(),
          },
        })
        .returning();

      return updated;
    }),
});
