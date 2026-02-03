import { db } from '../db';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { 
    getSubscriptionConfig, 
    getCreditLimit, 
    CreditLimits,
    CreditPeriod 
} from '@woolet/shared';
import { aiUsage } from '../db/schema/ai-usage';

type CreditFeature = keyof CreditLimits;

interface UsageRecord {
    countToday: number;
    countThisWeek: number;
    countThisMonth: number;
    countLifetime: number;
    lastDailyReset: Date;
    lastWeeklyReset: Date;
    lastMonthlyReset: Date;
}

export class CreditService {
    private getStartOfDay(): Date {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return now;
    }

    private getStartOfWeek(): Date {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
        now.setDate(diff);
        now.setHours(0, 0, 0, 0);
        return now;
    }

    private getStartOfMonth(): Date {
        const now = new Date();
        now.setDate(1);
        now.setHours(0, 0, 0, 0);
        return now;
    }

    private needsReset(lastReset: Date, period: CreditPeriod): boolean {
        switch (period) {
            case 'daily':
                return lastReset < this.getStartOfDay();
            case 'weekly':
                return lastReset < this.getStartOfWeek();
            case 'monthly':
                return lastReset < this.getStartOfMonth();
            case 'lifetime':
                return false;
        }
    }

    private getCountForPeriod(usage: UsageRecord, period: CreditPeriod, lastReset: Date): number {
        switch (period) {
            case 'daily':
                return this.needsReset(lastReset, 'daily') ? 0 : usage.countToday;
            case 'weekly':
                return this.needsReset(lastReset, 'weekly') ? 0 : usage.countThisWeek;
            case 'monthly':
                return this.needsReset(lastReset, 'monthly') ? 0 : usage.countThisMonth;
            case 'lifetime':
                return usage.countLifetime;
        }
    }

    /**
     * Check if user has credits available for a feature
     */
    async checkCredit(
        userId: string,
        userTier: string,
        feature: CreditFeature
    ): Promise<{ allowed: boolean; remaining: number; limit: number; message?: string }> {
        const config = getCreditLimit(userTier, feature);
        const { limit, period, lifetimeLimit } = config;

        // For AI chat on free tier, check lifetime limit
        if (feature === 'aiChat' && userTier === 'free' && lifetimeLimit !== undefined) {
            const usage = await this.getUsage(userId, feature);
            const remaining = Math.max(0, lifetimeLimit - usage.countLifetime);
            
            if (remaining <= 0) {
                return {
                    allowed: false,
                    remaining: 0,
                    limit: lifetimeLimit,
                    message: `You've used all ${lifetimeLimit} free AI questions. Upgrade to Pro for daily credits!`
                };
            }
            return { allowed: true, remaining, limit: lifetimeLimit };
        }

        // For period-based limits
        if (limit === 0) {
            return {
                allowed: false,
                remaining: 0,
                limit: 0,
                message: `This feature requires an upgrade.`
            };
        }

        if (limit === Infinity) {
            return { allowed: true, remaining: Infinity, limit: Infinity };
        }

        const usage = await this.getUsage(userId, feature);
        const currentCount = this.getCountForPeriod(usage, period, usage.lastDailyReset);
        const remaining = Math.max(0, limit - currentCount);

        if (remaining <= 0) {
            const periodText = period === 'daily' ? 'today' : period === 'weekly' ? 'this week' : 'this month';
            return {
                allowed: false,
                remaining: 0,
                limit,
                message: `You've reached your ${period} limit (${limit}) for this feature. Try again ${period === 'daily' ? 'tomorrow' : 'next ' + period.replace('ly', '')}.`
            };
        }

        return { allowed: true, remaining, limit };
    }

    /**
     * Use one credit for a feature (check and increment)
     */
    async useCredit(userId: string, userTier: string, feature: CreditFeature): Promise<void> {
        const check = await this.checkCredit(userId, userTier, feature);
        
        if (!check.allowed) {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: check.message || 'Credit limit reached'
            });
        }

        await this.incrementUsage(userId, feature);
    }

    /**
     * Get usage stats for a feature
     */
    async getUsage(userId: string, feature: CreditFeature): Promise<UsageRecord> {
        // For now, we map to aiUsage table - can be extended to other tables later
        if (feature === 'aiChat' || feature === 'aiDigestRegeneration') {
            const usage = await db.query.aiUsage.findFirst({
                where: eq(aiUsage.userId, userId)
            });

            if (!usage) {
                return {
                    countToday: 0,
                    countThisWeek: 0,
                    countThisMonth: 0,
                    countLifetime: 0,
                    lastDailyReset: new Date(),
                    lastWeeklyReset: new Date(),
                    lastMonthlyReset: new Date(),
                };
            }

            // Convert date string to Date object
            const lastReset = new Date(usage.lastResetDate);
            
            return {
                countToday: usage.questionCountToday,
                countThisWeek: usage.questionCountToday, // Extend schema for weekly tracking
                countThisMonth: usage.questionCountToday, // Extend schema for monthly tracking
                countLifetime: usage.questionCountLifetime,
                lastDailyReset: lastReset,
                lastWeeklyReset: lastReset,
                lastMonthlyReset: lastReset,
            };
        }

        // Default for features without tracking yet
        return {
            countToday: 0,
            countThisWeek: 0,
            countThisMonth: 0,
            countLifetime: 0,
            lastDailyReset: new Date(),
            lastWeeklyReset: new Date(),
            lastMonthlyReset: new Date(),
        };
    }

    /**
     * Increment usage counter
     */
    private async incrementUsage(userId: string, feature: CreditFeature): Promise<void> {
        if (feature === 'aiChat' || feature === 'aiDigestRegeneration') {
            const existing = await db.query.aiUsage.findFirst({
                where: eq(aiUsage.userId, userId)
            });

            const today = this.getStartOfDay();
            const todayStr = today.toISOString().split('T')[0];
            const needsReset = !existing || existing.lastResetDate < todayStr;

            if (!existing) {
                const now = new Date();
                await db.insert(aiUsage).values({
                    userId,
                    questionCountToday: 1,
                    questionCountLifetime: 1,
                    lastResetDate: now.toISOString().split('T')[0],
                });
            } else {
                const now = new Date();
                await db.update(aiUsage)
                    .set({
                        questionCountToday: needsReset ? 1 : existing.questionCountToday + 1,
                        questionCountLifetime: existing.questionCountLifetime + 1,
                        lastResetDate: needsReset ? now.toISOString().split('T')[0] : existing.lastResetDate,
                        updatedAt: now,
                    })
                    .where(eq(aiUsage.userId, userId));
            }
        }
    }

    /**
     * Get remaining credits for display
     */
    async getRemainingCredits(
        userId: string,
        userTier: string,
        feature: CreditFeature
    ): Promise<{ remaining: number | 'unlimited'; limit: number | 'unlimited'; period: CreditPeriod }> {
        const config = getCreditLimit(userTier, feature);
        const check = await this.checkCredit(userId, userTier, feature);

        return {
            remaining: check.remaining === Infinity ? 'unlimited' : check.remaining,
            limit: check.limit === Infinity ? 'unlimited' : check.limit,
            period: config.period,
        };
    }
}

export const creditService = new CreditService();
