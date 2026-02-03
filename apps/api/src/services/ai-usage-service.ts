import { db } from '../db';
import { aiUsage } from '../db/schema/ai-usage';
import { eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { TIER_LIMITS, getCreditLimit, getSubscriptionConfig } from '@woolet/shared';

type TierKey = keyof typeof TIER_LIMITS;

export class AIUsageService {
    /**
     * Check if user can ask an AI question based on their tier
     * @returns true if allowed, throws error if limit reached
     */
    async checkAndIncrementUsage(userId: string, userTier: string): Promise<void> {
        const tier = (userTier || 'free') as TierKey;
        const config = getSubscriptionConfig(tier);
        const creditConfig = getCreditLimit(tier, 'aiChat');

        // Get or create usage record
        let usage = await db.query.aiUsage.findFirst({
            where: eq(aiUsage.userId, userId)
        });

        if (!usage) {
            // First time user - create record
            const [newUsage] = await db.insert(aiUsage).values({
                userId,
                questionCountToday: 0,
                questionCountLifetime: 0,
                lastResetDate: new Date(),
            }).returning();
            usage = newUsage;
        }

        // Check if we need to reset daily counter
        const today = new Date().toISOString().split('T')[0];
        const lastReset = usage.lastResetDate.toISOString().split('T')[0];
        const needsReset = today !== lastReset;

        let currentDaily = needsReset ? 0 : usage.questionCountToday;
        let currentLifetime = usage.questionCountLifetime;

        // Check limits based on tier using new config
        if (tier === 'free') {
            // Free tier: Check lifetime limit
            const lifetimeLimit = creditConfig.lifetimeLimit ?? 3;
            if (currentLifetime >= lifetimeLimit) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `You've used all ${lifetimeLimit} free AI questions. Upgrade to Pro ($8/month) for 5 questions per day!`
                });
            }
        } else {
            // Pro/Premium: Check daily limit
            const dailyLimit = creditConfig.limit;
            if (currentDaily >= dailyLimit) {
                const nextTier = tier === 'pro' ? 'Premium ($20/month) for 20 questions/day' : 'maximum daily limit';
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `Daily AI question limit reached (${dailyLimit}). ${tier === 'pro' ? `Upgrade to ${nextTier}` : 'Try again tomorrow.'}`
                });
            }
        }

        // Increment counters
        await db.update(aiUsage)
            .set({
                questionCountToday: needsReset ? 1 : currentDaily + 1,
                questionCountLifetime: currentLifetime + 1,
                lastResetDate: needsReset ? new Date() : usage.lastResetDate,
                updatedAt: new Date(),
            })
            .where(eq(aiUsage.userId, userId));
    }

    /**
     * Get current usage stats for a user
     */
    async getUsage(userId: string, userTier: string): Promise<{
        daily: number;
        lifetime: number;
        dailyLimit: number | 'unlimited';
        lifetimeLimit: number | 'unlimited';
        remainingToday: number | 'unlimited';
        remainingLifetime: number | 'unlimited';
    }> {
        const tier = (userTier || 'free') as TierKey;
        const creditConfig = getCreditLimit(tier, 'aiChat');

        let usage = await db.query.aiUsage.findFirst({
            where: eq(aiUsage.userId, userId)
        });

        if (!usage) {
            usage = {
                questionCountToday: 0,
                questionCountLifetime: 0,
                lastResetDate: new Date(),
            } as any;
        }

        // Check if daily needs reset
        const today = new Date().toISOString().split('T')[0];
        const lastReset = usage.lastResetDate.toISOString().split('T')[0];
        const currentDaily = today === lastReset ? usage.questionCountToday : 0;

        const dailyLimit = tier === 'free' ? 0 : creditConfig.limit;
        const lifetimeLimit = creditConfig.lifetimeLimit ?? Infinity;

        return {
            daily: currentDaily,
            lifetime: usage.questionCountLifetime,
            dailyLimit: dailyLimit === Infinity ? 'unlimited' : dailyLimit,
            lifetimeLimit: lifetimeLimit === Infinity ? 'unlimited' : lifetimeLimit,
            remainingToday: dailyLimit === Infinity 
                ? 'unlimited' 
                : tier === 'free' 
                    ? 0 
                    : Math.max(0, dailyLimit - currentDaily),
            remainingLifetime: lifetimeLimit === Infinity 
                ? 'unlimited' 
                : Math.max(0, lifetimeLimit - usage.questionCountLifetime),
        };
    }

    /**
     * Reset all daily counters (call this via cron at midnight)
     */
    async resetDailyCounters(): Promise<void> {
        await db.update(aiUsage)
            .set({
                questionCountToday: 0,
                lastResetDate: new Date(),
                updatedAt: new Date(),
            })
            .where(sql`last_reset_date < CURRENT_DATE`);
    }
}
export const aiUsageService = new AIUsageService();
