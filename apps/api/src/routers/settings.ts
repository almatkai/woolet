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
          paymentStatusLogic: 'monthly',
          paymentStatusPeriod: '15',
          mortgageStatusLogic: null,
          mortgageStatusPeriod: null,
          creditStatusLogic: null,
          creditStatusPeriod: null,
          subscriptionStatusLogic: null,
          subscriptionStatusPeriod: null,
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
        paymentStatusLogic: z.string().optional(),
        paymentStatusPeriod: z.string().optional(),
        creditStatusLogic: z.string().nullable().optional(),
        creditStatusPeriod: z.string().nullable().optional(),
        mortgageStatusLogic: z.string().nullable().optional(),
        mortgageStatusPeriod: z.string().nullable().optional(),
        subscriptionStatusLogic: z.string().nullable().optional(),
        subscriptionStatusPeriod: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (input.defaultCurrency !== undefined) updateData.defaultCurrency = input.defaultCurrency;
      if (input.paymentStatusLogic !== undefined) updateData.paymentStatusLogic = input.paymentStatusLogic;
      if (input.paymentStatusPeriod !== undefined) updateData.paymentStatusPeriod = input.paymentStatusPeriod;
      if (input.creditStatusLogic !== undefined) updateData.creditStatusLogic = input.creditStatusLogic;
      if (input.creditStatusPeriod !== undefined) updateData.creditStatusPeriod = input.creditStatusPeriod;
      if (input.mortgageStatusLogic !== undefined) updateData.mortgageStatusLogic = input.mortgageStatusLogic;
      if (input.mortgageStatusPeriod !== undefined) updateData.mortgageStatusPeriod = input.mortgageStatusPeriod;
      if (input.subscriptionStatusLogic !== undefined) updateData.subscriptionStatusLogic = input.subscriptionStatusLogic;
      if (input.subscriptionStatusPeriod !== undefined) updateData.subscriptionStatusPeriod = input.subscriptionStatusPeriod;

      // Update or insert settings
      const [updated] = await db
        .insert(userSettings)
        .values({
          userId,
          defaultCurrency: input.defaultCurrency || 'USD',
          paymentStatusLogic: input.paymentStatusLogic || 'monthly',
          paymentStatusPeriod: input.paymentStatusPeriod || '15',
          creditStatusLogic: input.creditStatusLogic ?? null,
          creditStatusPeriod: input.creditStatusPeriod ?? null,
          mortgageStatusLogic: input.mortgageStatusLogic ?? null,
          mortgageStatusPeriod: input.mortgageStatusPeriod ?? null,
          subscriptionStatusLogic: input.subscriptionStatusLogic ?? null,
          subscriptionStatusPeriod: input.subscriptionStatusPeriod ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: updateData,
        })
        .returning();

      return updated;
    }),
});
