import { desc, eq, and, gte, count } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../../db';
import { stockPrices, portfolioHoldings, marketDigests } from '../../db/schema';
import { newsService } from '../investing/news-service';
import { generateTextWithFallback } from '../../lib/ai';
import { cache, CACHE_KEYS, redis } from '../../lib/redis';
import { TRPCError } from '@trpc/server';
import { GlitchTip } from '../../lib/error-tracking';

const DAILY_KIND = 'daily';
const CUSTOM_KIND = 'custom';
const MAX_CUSTOM_DIGESTS_PER_DAY = 5;
const PENDING_DIGEST = '__PENDING__';
const DAILY_DIGEST_LOCK_TTL_SECONDS = 180; // 3 minutes max lock time
const DAILY_DIGEST_GENERATION_TIMEOUT_MS = 120000; // 2 minutes for generation

export class DigestService {
    private getTodayDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    private getSecondsUntilEndOfDay(): number {
        const now = new Date();
        const end = new Date(now);
        end.setUTCHours(24, 0, 0, 0);
        const seconds = Math.floor((end.getTime() - now.getTime()) / 1000);
        return Math.max(60, seconds);
    }

    private getSpecsHash(specs: string): string {
        return crypto.createHash('sha256').update(specs).digest('hex');
    }

    private async generateAndStoreDailyDigest(
        userId: string,
        digestLength: 'short' | 'complete',
        digestDate: string,
        cacheKey: string,
        lockKey: string
    ): Promise<void> {
        try {
            console.log(`[DigestService] 🤖 Starting LLM generation for user ${userId} (${digestLength})`);
            const startTime = Date.now();

            const digest = await this.generateDigestText(userId, digestLength);
            
            const duration = Date.now() - startTime;
            console.log(`[DigestService] 🤖 LLM generated digest in ${duration}ms (${digest.length} chars)`);

            // Check if a daily digest already exists for this user/date
            const existing = await db.query.marketDigests.findFirst({
                where: and(
                    eq(marketDigests.userId, userId),
                    eq(marketDigests.digestDate, digestDate),
                    eq(marketDigests.kind, DAILY_KIND)
                )
            });

            if (existing) {
                // Update existing digest
                await db.update(marketDigests)
                    .set({ content: digest, updatedAt: new Date() })
                    .where(eq(marketDigests.id, existing.id));
            } else {
                // Insert new digest
                await db.insert(marketDigests).values({
                    userId,
                    digestDate,
                    kind: DAILY_KIND,
                    content: digest,
                });
            }

            await cache.set(cacheKey, digest, this.getSecondsUntilEndOfDay());
            console.log(`[DigestService] ✅ Stored digest for user ${userId}`);
        } catch (error) {
            console.error(`[DigestService] ❌ Error generating daily digest for user ${userId}:`, error);
            
            GlitchTip.captureException(error, {
                tags: {
                    service: 'digest-generation',
                    digestType: 'daily',
                },
                extra: {
                    userId,
                    digestLength,
                    digestDate,
                },
            });

            throw error;
        } finally {
            await redis.del(lockKey);
            console.log(`[DigestService] Released lock for user ${userId}`);
        }
    }

    async getDailyDigest(userId: string, digestLength: 'short' | 'complete'): Promise<string> {
        const digestDate = this.getTodayDate();
        const cacheKey = CACHE_KEYS.marketDigestDaily(userId, digestDate);
        const lockKey = `${cacheKey}:lock`;

        try {
            // 1. Check Redis cache first
            const cached = await cache.get<string>(cacheKey);
            if (cached && cached !== PENDING_DIGEST) {
                console.log(`[DigestService] 💾 CACHE HIT for user ${userId} - returning cached digest (${cached.length} chars)`);
                return cached;
            }

            // 2. Check database
            const existing = await db.query.marketDigests.findFirst({
                where: and(
                    eq(marketDigests.userId, userId),
                    eq(marketDigests.digestDate, digestDate),
                    eq(marketDigests.kind, DAILY_KIND)
                )
            });

            if (existing?.content) {
                console.log(`[DigestService] 🗄️  DATABASE HIT for user ${userId} - returning DB digest (${existing.content.length} chars)`);
                await cache.set(cacheKey, existing.content, this.getSecondsUntilEndOfDay());
                return existing.content;
            }

            // 3. Try to acquire lock for generation
            const lockSet = await redis.set(lockKey, '1', 'NX', 'EX', DAILY_DIGEST_LOCK_TTL_SECONDS);

            if (lockSet) {
                console.log(`[DigestService] 🔒 Lock acquired, starting background LLM generation for user ${userId}`);
                
                // Set pending state in cache so other requests know generation is happening
                await cache.set(cacheKey, PENDING_DIGEST, DAILY_DIGEST_LOCK_TTL_SECONDS);
                
                // Start generation in background (don't await - let it complete async)
                this.generateAndStoreDailyDigest(userId, digestLength, digestDate, cacheKey, lockKey)
                    .catch((error) => {
                        console.error(`[DigestService] ❌ Background LLM generation failed for user ${userId}:`, error);
                        // Clear the pending state on failure
                        cache.del(cacheKey);
                    });
                
                return PENDING_DIGEST;
            } else {
                // Another request is generating - check if it's still active
                const lockTTL = await redis.ttl(lockKey);
                if (lockTTL > 0) {
                    console.log(`[DigestService] Generation in progress for user ${userId} (TTL: ${lockTTL}s)`);
                    return PENDING_DIGEST;
                } else {
                    // Lock expired but no digest - something went wrong
                    console.error(`[DigestService] Lock expired but no digest found for user ${userId}`);
                    
                    GlitchTip.captureMessage('Digest generation lock expired without result', {
                        level: 'warning',
                        tags: { service: 'digest-generation' },
                        extra: { userId, digestDate },
                    });
                    
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Digest generation timed out. Please try again.',
                    });
                }
            }
        } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error(`[DigestService] Unexpected error in getDailyDigest for user ${userId}:`, error);
            
            GlitchTip.captureException(error, {
                tags: { service: 'digest-service', method: 'getDailyDigest' },
                extra: { userId, digestLength },
            });
            
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch or generate digest. Our team has been notified.',
            });
        }
    }

    async regenerateDigest(userId: string, digestLength: 'short' | 'complete', specs: string): Promise<string> {
        const digestDate = this.getTodayDate();
        const trimmedSpecs = specs.trim();

        console.log(`[DigestService] Regenerate request from user ${userId} with specs: ${trimmedSpecs.substring(0, 50)}...`);


        if (trimmedSpecs.length < 5) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Please add a bit more detail for your custom digest.'
            });
        }

        const specsHash = this.getSpecsHash(trimmedSpecs);
        const cacheKey = CACHE_KEYS.marketDigestCustom(userId, digestDate, specsHash);

        const cached = await cache.get<string>(cacheKey);
        if (cached) {
            console.log(`[DigestService] 💾 CACHE HIT for custom digest user ${userId} (${cached.length} chars)`);
            return cached;
        }

        const [existingCount] = await db.select({ count: count() })
            .from(marketDigests)
            .where(and(
                eq(marketDigests.userId, userId),
                eq(marketDigests.digestDate, digestDate),
                eq(marketDigests.kind, CUSTOM_KIND)
            ));

        if (Number(existingCount.count) >= MAX_CUSTOM_DIGESTS_PER_DAY) {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: `Daily digest regeneration limit reached (${MAX_CUSTOM_DIGESTS_PER_DAY}). Try again tomorrow.`
            });
        }

        try {
            console.log(`[DigestService] 🤖 Starting LLM generation for custom digest user ${userId}`);
            const startTime = Date.now();
            const digest = await this.generateDigestText(userId, digestLength, trimmedSpecs);
            const duration = Date.now() - startTime;

            await db.insert(marketDigests).values({
                userId,
                digestDate,
                kind: CUSTOM_KIND,
                specs: trimmedSpecs,
                specsHash,
                content: digest,
            });

            await cache.set(cacheKey, digest, this.getSecondsUntilEndOfDay());
            console.log(`[DigestService] ✅ Custom digest generated via LLM in ${duration}ms for user ${userId} (${digest.length} chars)`);
            return digest;
        } catch (error) {
            console.error(`[DigestService] ❌ Error regenerating digest for user ${userId}:`, error);
            
            GlitchTip.captureException(error, {
                tags: {
                    service: 'digest-generation',
                    digestType: 'custom',
                },
                extra: {
                    userId,
                    specs: trimmedSpecs,
                },
            });
            
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to generate custom digest. Our team has been notified.',
            });
        }
    }

    async getRemainingCustomDigestCount(userId: string): Promise<number> {
        const digestDate = this.getTodayDate();
        const [existingCount] = await db.select({ count: count() })
            .from(marketDigests)
            .where(and(
                eq(marketDigests.userId, userId),
                eq(marketDigests.digestDate, digestDate),
                eq(marketDigests.kind, CUSTOM_KIND)
            ));

        return Math.max(0, MAX_CUSTOM_DIGESTS_PER_DAY - Number(existingCount.count));
    }

    private async generateDigestText(
        userId: string,
        digestLength: 'short' | 'complete',
        specs?: string
    ): Promise<string> {
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
        const stockMap = new Map<string, { ticker: string; name: string; quantity: number; stockId: string }>();

        for (const h of holdings) {
            const current = stockMap.get(h.stockId) || {
                ticker: h.stock.ticker,
                name: h.stock.name,
                quantity: 0,
                stockId: h.stockId,
            };
            current.quantity += Number(h.quantity);
            stockMap.set(h.stockId, current);
        }

        // Filter out zero holdings and take top 10 (arbitrary limit for context window)
        // Ideally we sort by value, but we need current price for that.
        // For now, just take the first 10 distinct stocks.
        const activeStocks = Array.from(stockMap.values())
            .filter((s) => s.quantity > 0)
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
                limit: 7,
            });

            // Get recent news
            const news = await newsService.getNewsForTicker(stock.ticker);

            return {
                ticker: stock.ticker,
                name: stock.name,
                prices: prices.map((p) => ({ date: p.date, close: p.close })),
                news: news.map((n) => ({ title: n.title, date: n.pubDate })),
            };
        });

        const stocksContext = await Promise.all(stockDataPromises);

        const lengthInstruction =
            digestLength === 'short'
                ? 'Keep it concise: 200-300 words.'
                : 'Provide a complete digest: 900-1200 words.';

        const specsInstruction = specs
            ? `User focus/questions:\n${specs}\n`
            : 'User focus/questions: None provided.';

        // 3. Construct Prompt
        const prompt = `
You are a smart financial assistant for the app "Woolet".
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
8. Do NOT give buy/sell recommendations. Base insights only on news and recent price action.
9. Start with a title line: "## Market Insight Digest 📊".
10. End with a line starting with "*" that says it's not investment advice and is based on current news.
11. ${lengthInstruction}

${specsInstruction}

Data:
${JSON.stringify(stocksContext, null, 2)}
`;

        // 4. Call AI
        try {
            const { text } = await generateTextWithFallback({
                purpose: 'daily-digest',
                prompt,
            });
            
            if (!text || text.length < 50) {
                throw new Error('AI returned empty or too short response');
            }
            
            return text;
        } catch (error) {
            console.error('Error calling AI for digest generation:', error);
            
            GlitchTip.captureException(error, {
                tags: {
                    service: 'ai-generation',
                    purpose: 'daily-digest',
                },
                extra: {
                    userId,
                    stockCount: activeStocks.length,
                    hasSpecs: !!specs,
                },
            });
            
            throw new Error(`AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

export const digestService = new DigestService();
