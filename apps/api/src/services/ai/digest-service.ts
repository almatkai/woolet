import { desc, eq, and, inArray, gte, sql } from 'drizzle-orm';
import { db } from '../../db';
import { stocks, stockPrices, portfolioHoldings } from '../../db/schema';
import { newsService } from '../investing/news-service';
import { generateTextWithFallback } from '../../lib/ai';

export class DigestService {
    async generateDailyDigest(userId: string) {
        // 1. Get user's active stocks (from portfolio holdings)
        // We aggregate by stock to get total quantity
        const holdings = await db.query.portfolioHoldings.findMany({
            where: eq(portfolioHoldings.userId, userId),
            with: {
                stock: true,
            },
        });

        if (holdings.length === 0) {
            return "You don't have any stocks in your portfolio yet. Add some positions to get a personalized news digest!";
        }

        // Group by stock and calculate total quantity
        const stockMap = new Map<string, { ticker: string, name: string, quantity: number, stockId: string }>();

        for (const h of holdings) {
            const current = stockMap.get(h.stockId) || {
                ticker: h.stock.ticker,
                name: h.stock.name,
                quantity: 0,
                stockId: h.stockId
            };
            current.quantity += Number(h.quantity);
            stockMap.set(h.stockId, current);
        }

        // Filter out zero holdings and take top 10 (arbitrary limit for context window)
        // Ideally we sort by value, but we need current price for that.
        // For now, just take the first 10 distinct stocks.
        const activeStocks = Array.from(stockMap.values())
            .filter(s => s.quantity > 0)
            .slice(0, 10);

        if (activeStocks.length === 0) {
            return "Your portfolio is currently empty (all positions sold).";
        }

        // 2. Gather data for each stock
        const stockDataPromises = activeStocks.map(async (stock) => {
            // Get last 7 days of prices
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const prices = await db.query.stockPrices.findMany({
                where: and(
                    eq(stockPrices.stockId, stock.stockId),
                    gte(stockPrices.date, sevenDaysAgo.toISOString().split('T')[0])
                ),
                orderBy: [desc(stockPrices.date)],
                limit: 7
            });

            // Get recent news
            const news = await newsService.getNewsForTicker(stock.ticker);

            return {
                ticker: stock.ticker,
                name: stock.name,
                prices: prices.map(p => ({ date: p.date, close: p.close })),
                news: news.map(n => ({ title: n.title, date: n.pubDate }))
            };
        });

        const stocksContext = await Promise.all(stockDataPromises);

        // 3. Construct Prompt
        const prompt = `
You are a smart financial assistant for the app "Woolet ".
Analyze the following portfolio stocks and their recent news/price action.
Generate a "Market Insight Digest" for the user.

Rules:
1. Focus on stocks with significant price changes or important news (contracts, earnings, mergers).
2. Look for ongoing trends and long-term implications, not just daily fluctuations.
3. If a stock is stable and has no major news, skip it or mention it briefly in a "Steady" section.
4. Use a friendly but professional tone.
5. Format the output in Markdown. Use emojis.
6. Start each stock section with the Ticker symbol in bold, e.g., **AAPL**.
7. Group by "🚀 Movers & Shakers" and "📰 Strategic Updates".

Data:
${JSON.stringify(stocksContext, null, 2)}
`;

        // 4. Call AI
        try {
            const { text } = await generateTextWithFallback({
                purpose: 'daily-digest',
                prompt,
            });
            return text || "No insights generated.";
        } catch (error) {
            console.error("Error generating AI digest:", error);
            return "Sorry, I couldn't generate your digest right now. Please try again later.";
        }
    }
}

export const digestService = new DigestService();
