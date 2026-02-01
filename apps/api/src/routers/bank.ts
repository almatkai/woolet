import { z } from 'zod';
import { eq, desc, and, count } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../lib/trpc';
import { banks, accounts, currencyBalances } from '../db/schema';

// Pricing tiers and limits
export const TIER_LIMITS = {
    free: { 
        banks: 2, 
        accountsPerBank: 2, 
        currenciesPerAccount: 2,
        transactionHistoryDays: 90,
        totalStocks: 5,
        aiQuestionsPerDay: 0, // 3 total lifetime, tracked separately
        aiQuestionsLifetime: 3,
        hasAiMarketDigest: false,
        hasCurrencyWidget: false,
    },
    pro: { 
        banks: Infinity, 
        accountsPerBank: Infinity, 
        currenciesPerAccount: 5,
        transactionHistoryDays: Infinity,
        totalStocks: 20,
        aiQuestionsPerDay: 5,
        aiQuestionsLifetime: Infinity,
        hasAiMarketDigest: true,
        aiDigestLength: 'short', // 200-300 words
        hasCurrencyWidget: true,
    },
    premium: { 
        banks: Infinity, 
        accountsPerBank: Infinity, 
        currenciesPerAccount: Infinity,
        transactionHistoryDays: Infinity,
        totalStocks: 1000,
        aiQuestionsPerDay: 20,
        aiQuestionsLifetime: Infinity,
        hasAiMarketDigest: true,
        aiDigestLength: 'complete', // 1000+ words
        hasCurrencyWidget: true,
    }
} as const;

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
            const userTier = ctx.user.subscriptionTier || 'free';
            const limits = TIER_LIMITS[userTier as keyof typeof TIER_LIMITS];
            
            // Check bank limit
            const [result] = await ctx.db.select({ count: count() })
                .from(banks)
                .where(and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ));
            
            if (result.count >= limits.banks) {
                throw new TRPCError({ 
                    code: 'FORBIDDEN', 
                    message: `Bank limit reached (${limits.banks}). Upgrade to Pro for unlimited banks.` 
                });
            }

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

    // Get current limits and usage with feature flags
    getLimitsAndUsage: protectedProcedure
        .query(async ({ ctx }) => {
            const userTier = ctx.user.subscriptionTier || 'free';
            const limits = TIER_LIMITS[userTier as keyof typeof TIER_LIMITS];
            
            const [bankCount] = await ctx.db.select({ count: count() })
                .from(banks)
                .where(and(
                    eq(banks.userId, ctx.userId!),
                    eq(banks.isTest, ctx.user.testMode)
                ));

            return {
                tier: userTier,
                limits: {
                    banks: limits.banks === Infinity ? 'unlimited' : limits.banks,
                    accountsPerBank: limits.accountsPerBank === Infinity ? 'unlimited' : limits.accountsPerBank,
                    currenciesPerAccount: limits.currenciesPerAccount === Infinity ? 'unlimited' : limits.currenciesPerAccount,
                    totalStocks: limits.totalStocks,
                    aiQuestionsPerDay: limits.aiQuestionsPerDay,
                    aiQuestionsLifetime: limits.aiQuestionsLifetime === Infinity ? 'unlimited' : limits.aiQuestionsLifetime,
                },
                features: {
                    hasCurrencyWidget: limits.hasCurrencyWidget,
                    hasAiMarketDigest: limits.hasAiMarketDigest,
                    aiDigestLength: 'aiDigestLength' in limits ? limits.aiDigestLength : null,
                },
                usage: {
                    banks: bankCount.count,
                },
                canUpgrade: userTier !== 'premium'
            };
        }),
});
