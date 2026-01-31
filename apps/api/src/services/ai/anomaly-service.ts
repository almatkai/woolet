import { db } from '../../db';
import { transactions, categories } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { generateTextWithFallback } from '../../lib/ai';

export class AnomalyService {
    async detectSpendingAnomalies(userId: string) {
        // 1. Get current month stats
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        // 2. Get previous 3 months stats for comparison
        const startOfComparison = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];

        const userCategories = await db.query.categories.findMany({
            where: eq(categories.userId, userId),
        });
        const categoryIds = userCategories.map(c => c.id);

        if (categoryIds.length === 0) return null;

        // Fetch all expense transactions for these categories in the time range
        // Note: This might be heavy for many transactions, better to use SQL aggregation.
        // But Drizzle aggregation with filtered relations can be tricky.
        // Let's fetch raw data for the last 4 months (current + 3 prev)

        /*
           We need:
           Category | Month | Total
        */

        // Using raw SQL for aggregation might be cleaner here
        const result = await db.execute(sql`
            SELECT
                t.category_id as "categoryId",
                c.name as "categoryName",
                TO_CHAR(t.date, 'YYYY-MM') as month,
                SUM(t.amount) as total
            FROM ${transactions} t
            JOIN ${categories} c ON t.category_id = c.id
            WHERE c.user_id = ${userId}
            AND t.type = 'expense'
            AND t.date >= ${startOfComparison}
            GROUP BY t.category_id, c.name, month
            ORDER BY month DESC
        `);

        // Process data in JS
        const categoryStats = new Map<string, { name: string, current: number, history: number[] }>();

        const currentMonthKey = now.toISOString().slice(0, 7);

        for (const row of result) {
            const catId = row.categoryId as string;
            const month = row.month as string;
            const amount = Number(row.total); // Expenses are usually negative in some systems or positive in others.
            // In Woo-Let , expenses are usually stored as positive or negative?
            // Looking at `repro_price.ts` or similar might hint, but usually 'amount' is magnitude for expense type.
            // Let's assume positive magnitude for now or use Math.abs
            const absAmount = Math.abs(amount);

            if (!categoryStats.has(catId)) {
                categoryStats.set(catId, { name: row.categoryName as string, current: 0, history: [] });
            }
            const stats = categoryStats.get(catId)!;

            if (month === currentMonthKey) {
                stats.current += absAmount;
            } else {
                stats.history.push(absAmount);
            }
        }

        const anomalies = [];

        for (const [id, stats] of categoryStats.entries()) {
            if (stats.history.length === 0) continue;

            const avg = stats.history.reduce((a, b) => a + b, 0) / stats.history.length;
            // Simple threshold: 50% higher than average and absolute increase > 100
            if (stats.current > avg * 1.5 && stats.current > avg + 100) {
                anomalies.push({
                    category: stats.name,
                    current: stats.current,
                    average: avg,
                    percentage: ((stats.current - avg) / avg) * 100
                });
            }
        }

        if (anomalies.length === 0) return null;

        // Use AI to generate insights
        const prompt = `
You are a financial analyst for Woo-Let .
The user has some spending anomalies this month compared to their 3-month average.

Anomalies:
${JSON.stringify(anomalies, null, 2)}

Task:
1. Generate a friendly, non-judgmental alert.
2. Point out the biggest increases.
3. Offer a generic tip for reducing spend in these specific categories (e.g. for "Dining Out", suggest cooking at home).
4. Keep it short (max 3 sentences per anomaly).
5. Format as Markdown.
`;

        const { text } = await generateTextWithFallback({
            purpose: 'spending-anomalies',
            prompt,
        });
        return text || "No anomaly insights generated.";
    }
}

export const anomalyService = new AnomalyService();
