import { db } from '../../db';
import { aiUsage } from '../../db/schema';
import { and, eq, sql } from 'drizzle-orm';

export class AiUsageService {
    private static getTodayDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    static async getUsage(userId: string) {
        const today = this.getTodayDate();
        let usage = await db.query.aiUsage.findFirst({
            where: eq(aiUsage.userId, userId),
        });

        if (!usage) {
            // Create new record
            [usage] = await db.insert(aiUsage).values({
                userId,
                questionCountToday: 0,
                questionCountLifetime: 0,
                lastResetDate: today,
            }).returning();
        } else if (usage.lastResetDate !== today) {
            // Reset daily count if it's a new day
            [usage] = await db.update(aiUsage)
                .set({
                    questionCountToday: 0,
                    lastResetDate: today,
                    updatedAt: new Date(),
                })
                .where(eq(aiUsage.id, usage.id))
                .returning();
        }

        return usage;
    }

    static async incrementUsage(userId: string) {
        const today = this.getTodayDate();
        const usage = await this.getUsage(userId);

        await db.update(aiUsage)
            .set({
                questionCountToday: usage.questionCountToday + 1,
                questionCountLifetime: usage.questionCountLifetime + 1,
                updatedAt: new Date(),
            })
            .where(eq(aiUsage.id, usage.id));
    }
}
