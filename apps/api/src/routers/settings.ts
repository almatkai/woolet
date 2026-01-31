import { z } from 'zod';
import { protectedProcedure, router } from '../lib/trpc';
import { db } from '../db';
import { userSettings } from '../db/schema';
import { eq } from 'drizzle-orm';

export const settingsRouter = router({
  getUserSettings: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // Get or create user settings
    let settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });

    // Create default settings if not exists
    if (!settings) {
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId,
          defaultCurrency: 'USD',
        })
        .returning();
      settings = newSettings;
    }

    return settings;
  }),

  updateUserSettings: protectedProcedure
    .input(
      z.object({
        defaultCurrency: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      // Get existing settings
      const existing = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
      });

      if (existing) {
        // Update existing settings
        const [updated] = await db
          .update(userSettings)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(userSettings.userId, userId))
          .returning();
        return updated;
      } else {
        // Create new settings
        const [created] = await db
          .insert(userSettings)
          .values({
            userId,
            defaultCurrency: input.defaultCurrency || 'USD',
          })
          .returning();
        return created;
      }
    }),
});
