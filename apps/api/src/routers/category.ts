import { z } from 'zod';
import { eq, and, or, isNull } from 'drizzle-orm';
import { router, protectedProcedure } from '../lib/trpc';
import { categories } from '../db/schema';

export const categoryRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        // Get both default categories and user's custom categories
        return ctx.db.query.categories.findMany({
            where: or(
                isNull(categories.userId),
                eq(categories.userId, ctx.userId)
            ),
            orderBy: (categories, { asc }) => [asc(categories.name)],
        });
    }),

    create: protectedProcedure
        .input(z.object({
            name: z.string().min(1).max(50),
            icon: z.string().min(1),
            color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
            type: z.enum(['income', 'expense', 'transfer']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const [category] = await ctx.db.insert(categories).values({
                userId: ctx.userId,
                name: input.name,
                icon: input.icon,
                color: input.color,
                type: input.type,
            }).returning();

            return category;
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().min(1).max(50).optional(),
            icon: z.string().optional(),
            color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
            type: z.enum(['income', 'expense', 'transfer']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...updateData } = input;

            // Only allow updating user's own categories (not default ones)
            const [updated] = await ctx.db.update(categories)
                .set(updateData)
                .where(and(
                    eq(categories.id, id),
                    eq(categories.userId, ctx.userId)
                ))
                .returning();

            if (!updated) {
                throw new Error('Category not found or cannot be modified');
            }

            return updated;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const deleted = await ctx.db.delete(categories)
                .where(and(
                    eq(categories.id, input.id),
                    eq(categories.userId, ctx.userId)
                ))
                .returning();

            if (deleted.length === 0) {
                throw new Error('Category not found or cannot be deleted');
            }

            return { success: true };
        }),

});
