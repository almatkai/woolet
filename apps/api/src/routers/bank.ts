import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { banks, accounts, currencyBalances } from '../db/schema';

export const bankRouter = router({
    list: protectedProcedure
        .query(async ({ ctx }) => {
            const userBanks = await ctx.db.query.banks.findMany({
                where: and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ),
                orderBy: [desc(banks.createdAt)],
                with: {
                    // We can include accounts if needed, but for now just banks
                }
            });
            return userBanks;
        }),

    create: protectedProcedure
        .input(z.object({
            name: z.string().min(1),
            icon: z.string().optional(),
            color: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const [bank] = await ctx.db.insert(banks).values({
                userId: ctx.userId!,
                name: input.name,
                icon: input.icon,
                color: input.color,
                isTest: ctx.user.testMode,
            }).returning();
            return bank;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership before deletion
            const bank = await ctx.db.query.banks.findFirst({
                where: and(
                    eq(banks.id, input.id),
                    eq(banks.userId, ctx.userId!)
                )
            });

            if (!bank) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Bank not found' });
            }

            await ctx.db.delete(banks).where(eq(banks.id, input.id));
            return { success: true };
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().min(1).optional(),
            icon: z.string().optional(),
            color: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...updateData } = input;
            const [updated] = await ctx.db.update(banks)
                .set(updateData)
                .where(and(
                    eq(banks.id, id),
                    eq(banks.userId, ctx.userId!)
                ))
                .returning();

            if (!updated) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Bank not found' });
            }

            return updated;
        }),

    // Get full hierarchy for dashboard/sidebar
    getHierarchy: protectedProcedure
        .query(async ({ ctx }) => {
            const hierarchy = await ctx.db.query.banks.findMany({
                where: and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ),
                orderBy: [desc(banks.createdAt)],
                with: {
                    accounts: {
                        with: {
                            currencyBalances: true
                        }
                    }
                }
            });
            return hierarchy;
        }),
});
