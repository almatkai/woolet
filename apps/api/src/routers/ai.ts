import { router, protectedProcedure } from '../lib/trpc';
import { digestService } from '../services/ai/digest-service';
import { anomalyService } from '../services/ai/anomaly-service';
import { AiConfigService } from '../services/ai/ai-config-service';
import { AiUsageService } from '../services/ai/ai-usage-service';
import { analyticsService } from '../services/investing/analytics-service';
import { db } from '../db';
import { transactions, portfolioHoldings, accounts, currencyBalances, chatSessions, chatMessages, banks, marketDigests, aiConfig, categories, subscriptions, debts, credits, mortgages, deposits, fxRates, users } from '../db/schema';
import { createChatCompletionWithFallback, MODEL_FLASH, checkPromptGuard, getAiStatus } from '../lib/ai';
import { desc, asc, eq, and, gte, lte, inArray, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TIER_LIMITS } from './bank';
import { getAiDigestLength } from '../lib/checkLimit';
import { getCreditLimit } from '@woolet/shared';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { logger } from '../lib/logger';
import { cache } from '../lib/redis';

const aiRouterLogger = logger.child({ module: 'ai-router' });
const LOG_PREVIEW_LIMIT = Number(process.env.AI_LOG_PREVIEW_LIMIT || 20000);
const AGENT_TRACE_TTL_SECONDS = 60 * 5;

type AgentTraceStep = {
    key: string;
    label: string;
    detail?: string;
    status: 'done' | 'running' | 'pending';
};

type LiveAgentTracePayload = {
    trace: AgentTraceStep[];
    done: boolean;
    updatedAt: string;
};

function summarizeList(items: string[], max = 5): string {
    const normalized = items.map((i) => i.trim()).filter(Boolean);
    if (normalized.length <= max) return normalized.join(', ');
    const remainder = normalized.length - max;
    return `${normalized.slice(0, max).join(', ')} +${remainder} more`;
}

const TOOL_DISPLAY_LABELS: Record<string, string> = {
    search_transactions: 'Searching your transactions',
    get_account_balance: 'Getting your account balances',
    get_bank_balance: 'Getting your bank balance',
    get_categories: 'Getting your categories',
    get_subscriptions: 'Getting your subscriptions',
    get_portfolio: 'Getting your portfolio holdings',
    get_investing_value: 'Calculating your investing value',
    analyze_spending: 'Analyzing your spending',
    create_transaction: 'Creating your transaction',
    get_debts_and_credits: 'Getting your debts and credits',
    get_upcoming_payments: 'Getting your upcoming payments',
    get_net_worth_breakdown: 'Calculating your net worth',
    navigate_to: 'Opening requested page',
    query_docs: 'Searching help docs',
};

function getToolDisplayLabel(toolName: string): string {
    return TOOL_DISPLAY_LABELS[toolName] || `Running ${toolName}`;
}

function summarizeToolResult(toolName: string, toolResult: any): string {
    if (toolResult?.error) return `Error: ${String(toolResult.error)}`;

    if (toolName === 'get_account_balance') {
        const banksList = Array.isArray(toolResult?.banks) ? toolResult.banks : [];
        let accountCount = 0;
        let balanceCount = 0;
        const currencyTotals = new Map<string, number>();

        for (const bank of banksList) {
            const accountsList = Array.isArray(bank?.accounts) ? bank.accounts : [];
            accountCount += accountsList.length;
            for (const account of accountsList) {
                const balancesList = Array.isArray(account?.balances) ? account.balances : [];
                balanceCount += balancesList.length;
                for (const balance of balancesList) {
                    const currency = String(balance?.currency || 'UNKNOWN');
                    const amount = Number(balance?.amount || 0);
                    currencyTotals.set(currency, (currencyTotals.get(currency) || 0) + amount);
                }
            }
        }

        const totals = Array.from(currencyTotals.entries())
            .slice(0, 3)
            .map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`)
            .join(', ');
        return `${banksList.length} banks, ${accountCount} accounts, ${balanceCount} balances${totals ? ` (${totals})` : ''}`;
    }

    if (toolName === 'search_transactions') {
        const txCount = Array.isArray(toolResult?.transactions) ? toolResult.transactions.length : 0;
        return `${txCount} transactions`;
    }

    if (toolName === 'get_bank_balance') {
        const matched = Number(toolResult?.matchedBankCount || 0);
        if (matched <= 0) return 'No matching bank found';
        const primary = toolResult?.primaryMatch;
        if (primary?.name && primary?.totalsByCurrency) {
            const totals = Object.entries(primary.totalsByCurrency)
                .map(([currency, amount]) => `${currency} ${Number(amount).toFixed(2)}`)
                .join(', ');
            return totals ? `${primary.name}: ${totals}` : `${primary.name}: no balances`;
        }
        return `${matched} banks matched`;
    }

    if (toolName === 'get_categories') {
        const count = Array.isArray(toolResult?.categories) ? toolResult.categories.length : 0;
        return `${count} categories`;
    }

    if (toolName === 'get_subscriptions') {
        const count = Array.isArray(toolResult?.subscriptions) ? toolResult.subscriptions.length : 0;
        return `${count} subscriptions`;
    }

    if (toolName === 'get_portfolio') {
        const count = Array.isArray(toolResult?.holdings) ? toolResult.holdings.length : 0;
        return `${count} portfolio positions`;
    }

    if (toolName === 'get_investing_value') {
        const total = toolResult?.totalInvestingValue;
        const currency = toolResult?.currency;
        return total && currency ? `Investing value ${total} ${currency}` : 'Investing value calculated';
    }

    if (toolName === 'analyze_spending') {
        const count = Array.isArray(toolResult?.spending_by_category) ? toolResult.spending_by_category.length : 0;
        return `${count} spending groups`;
    }

    if (toolName === 'get_debts_and_credits') {
        const debtCount = Array.isArray(toolResult?.debts) ? toolResult.debts.length : 0;
        const creditCount = Array.isArray(toolResult?.credits) ? toolResult.credits.length : 0;
        const mortgageCount = Array.isArray(toolResult?.mortgages) ? toolResult.mortgages.length : 0;
        return `${debtCount} debts, ${creditCount} credits, ${mortgageCount} mortgages`;
    }

    if (toolName === 'get_upcoming_payments') {
        const subsCount = Array.isArray(toolResult?.subscriptions) ? toolResult.subscriptions.length : 0;
        const creditCount = Array.isArray(toolResult?.credits) ? toolResult.credits.length : 0;
        const mortgageCount = Array.isArray(toolResult?.mortgages) ? toolResult.mortgages.length : 0;
        return `${subsCount} subscriptions, ${creditCount} credits, ${mortgageCount} mortgages`;
    }

    if (toolName === 'get_net_worth_breakdown') {
        const total = toolResult?.totalNetWorth;
        const currency = toolResult?.defaultCurrency;
        return total && currency ? `Net worth ${total} ${currency}` : 'Net worth calculated';
    }

    if (toolName === 'navigate_to') {
        return toolResult?.path ? `Path: ${toolResult.path}` : 'Navigation prepared';
    }

    if (toolName === 'query_docs') {
        const results = Array.isArray(toolResult?.results) ? toolResult.results.length : 0;
        return `${results} docs matched`;
    }

    const keys = Object.keys(toolResult || {});
    return keys.length > 0 ? `Fields: ${keys.join(', ')}` : 'Completed';
}

function resolveNavigationPath(message: string): string | null {
    const q = message.toLowerCase();
    if (/(invest|portfolio|stocks?)/.test(q)) return '/investing';
    if (/(dashboard|home|overview)/.test(q)) return '/dashboard';
    if (/(transaction|spending|expense|income)/.test(q)) return '/transactions';
    if (/(account|bank|wallet|card)/.test(q)) return '/accounts';
    if (/(insight|report|analytics?)/.test(q)) return '/insights';
    if (/(setting|preference|profile)/.test(q)) return '/settings';
    if (/(budget|budgets)/.test(q)) return '/budget';
    return null;
}

function isFinanceDataIntentMessage(message: string): boolean {
    return /(balance|account|bank|spend|spending|expense|income|transaction|debt|credit|mortgage|subscription|portfolio|invest|net worth|budget|currency|cash|savings|loan|payment|money)/i.test(message);
}

function needsDefaultCurrencyContext(message: string): boolean {
    return /(default currency|currency|convert|conversion|exchange rate|fx|net worth|debt|liabilit|investing|portfolio value)/i.test(message);
}

function getAgentTraceCacheKey(userId: string, requestId: string): string {
    return `ai:trace:${userId}:${requestId}`;
}

async function persistAgentTrace(
    userId: string,
    requestId: string,
    trace: AgentTraceStep[],
    done = false
): Promise<void> {
    try {
        await cache.set<LiveAgentTracePayload>(
            getAgentTraceCacheKey(userId, requestId),
            {
                trace,
                done,
                updatedAt: new Date().toISOString(),
            },
            AGENT_TRACE_TTL_SECONDS
        );
    } catch (error) {
        aiRouterLogger.warn({
            event: 'chat.trace.persist_failed',
            userId,
            requestId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function upsertAgentTraceStep(trace: AgentTraceStep[], nextStep: AgentTraceStep): void {
    const idx = trace.findIndex((step) => step.key === nextStep.key);
    if (idx >= 0) {
        trace[idx] = { ...trace[idx], ...nextStep };
        return;
    }
    trace.push(nextStep);
}

function toPreview(value: unknown, maxLen = LOG_PREVIEW_LIMIT): string {
    try {
        const json = JSON.stringify(value);
        if (!json) return '';
        return json.length > maxLen ? `${json.slice(0, maxLen)}...<truncated>` : json;
    } catch {
        return String(value);
    }
}

export const aiRouter = router({
    getDailyDigest: protectedProcedure
        .input(z.object({ date: z.string().optional() }).optional())
        .query(async ({ ctx, input }) => {
            const userTier = ctx.user.subscriptionTier || 'free';
            const limits = TIER_LIMITS[userTier as keyof typeof TIER_LIMITS];
            const todayUtc = new Date().toISOString().split('T')[0];
            const todayLocal = new Date().toLocaleDateString('en-CA');
            const targetDate = input?.date || todayUtc;
            const isToday = targetDate === todayUtc || targetDate === todayLocal;

            console.log(`[AI Router] getDailyDigest request from user ${ctx.userId} - Date: ${targetDate}, Tier: ${userTier}, hasAccess: ${limits.hasAiMarketDigest}`);

            if (!limits.hasAiMarketDigest) {
                return {
                    locked: true,
                    userTier,
                    digest: null,
                    digestDate: targetDate,
                    canRegenerate: false,
                    remainingRegenerations: 0,
                    regenerationLimit: 0,
                    message: 'Upgrade to Pro or Premium to unlock AI Market Insights',
                };
            }

            let digest: string | null | undefined;
            if (isToday) {
                const digestLength = getAiDigestLength(userTier) || 'short';
                digest = await digestService.getDailyDigest(ctx.userId!, digestLength, targetDate);
            } else {
                const entry = await db.query.marketDigests.findFirst({
                    where: and(
                        eq(marketDigests.userId, ctx.userId!),
                        eq(marketDigests.kind, 'daily'),
                        eq(marketDigests.digestDate, targetDate)
                    )
                });
                digest = entry?.content;
                if (digest) {
                    await digestService.cacheDigestForDate(ctx.userId!, targetDate, digest);
                }
            }

            // Fetch follow-ups for this date
            const followUps = await db.query.marketDigests.findMany({
                where: and(
                    eq(marketDigests.userId, ctx.userId!),
                    eq(marketDigests.digestDate, targetDate),
                    eq(marketDigests.kind, 'custom')
                ),
                orderBy: [asc(marketDigests.createdAt)]
            });

            const canRegenerate = userTier === 'premium' && isToday;
            const remainingRegenerations = canRegenerate
                ? await digestService.getRemainingCustomDigestCount(ctx.userId!, targetDate)
                : 0;

            return {
                locked: false,
                userTier,
                digest,
                followUps,
                digestDate: targetDate,
                canRegenerate,
                remainingRegenerations,
                regenerationLimit: (limits as any).aiDigestRegeneratePerDay || 0,
            };
        }),

    getAvailableDigestDates: protectedProcedure
        .query(async ({ ctx }) => {
            const entries = await db.query.marketDigests.findMany({
                where: and(
                    eq(marketDigests.userId, ctx.userId!),
                    eq(marketDigests.kind, 'daily')
                ),
                columns: {
                    digestDate: true,
                }
            });
            return entries.map(e => e.digestDate);
        }),

    getDigestHistory: protectedProcedure
        .query(async ({ ctx }) => {
            const userTier = ctx.user.subscriptionTier || 'free';
            const limits = TIER_LIMITS[userTier as keyof typeof TIER_LIMITS];

            if (!limits.hasAiMarketDigest) {
                return [];
            }

            const history = await db.query.marketDigests.findMany({
                where: and(
                    eq(marketDigests.userId, ctx.userId!),
                    eq(marketDigests.kind, 'daily')
                ),
                orderBy: [desc(marketDigests.digestDate)],
                limit: 10,
                columns: {
                    digestDate: true,
                    content: true,
                }
            });

            return history;
        }),

    regenerateDigest: protectedProcedure
        .input(z.object({
            specs: z.string().min(5).max(500),
            date: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userTier = ctx.user.subscriptionTier || 'free';

            if (userTier !== 'premium') {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Digest regeneration is a Premium feature. Upgrade to Premium to use it.'
                });
            }

            // Check for prompt injection
            const guard = await checkPromptGuard(input.specs);
            if (!guard.isSafe) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: "Looks like you are trying to prompt inject, huh? 🤨"
                });
            }

            const digestLength = getAiDigestLength(userTier) || 'complete';
            const digest = await digestService.regenerateDigest(ctx.userId!, digestLength, input.specs, input.date);
            const remainingRegenerations = await digestService.getRemainingCustomDigestCount(ctx.userId!, input.date);

            return {
                digest,
                digestDate: new Date().toISOString().split('T')[0],
                remainingRegenerations,
            };
        }),

    getSpendingAnomalies: protectedProcedure
        .query(async ({ ctx }) => {
            return await anomalyService.detectSpendingAnomalies(ctx.userId!);
        }),

    getChatUsage: protectedProcedure
        .query(async ({ ctx }) => {
            const userId = ctx.userId!;
            const usage = await AiUsageService.getUsage(userId);
            const userTier = ctx.user.subscriptionTier || 'free';
            const creditConfig = getCreditLimit(userTier, 'aiChat');

            const tierTitle = 'Woo'

            return {
                usageToday: usage.questionCountToday,
                usageLifetime: usage.questionCountLifetime,
                limit: creditConfig.limit,
                lifetimeLimit: creditConfig.lifetimeLimit,
                tierTitle,
                isLimited: userTier === 'pro',
                isFull: userTier === 'premium',
                remaining: creditConfig.limit > 0
                    ? Math.max(0, creditConfig.limit - usage.questionCountToday)
                    : creditConfig.lifetimeLimit
                        ? Math.max(0, creditConfig.lifetimeLimit - usage.questionCountLifetime)
                        : 0
            };
        }),

    getLiveTrace: protectedProcedure
        .input(z.object({
            requestId: z.string().min(1).max(128),
        }))
        .query(async ({ ctx, input }) => {
            const payload = await cache.get<LiveAgentTracePayload>(
                getAgentTraceCacheKey(ctx.userId!, input.requestId)
            );
            return payload || { trace: [], done: false, updatedAt: new Date().toISOString() };
        }),

    listSessions: protectedProcedure
        .query(async ({ ctx }) => {
            return await db.query.chatSessions.findMany({
                where: eq(chatSessions.userId, ctx.userId!),
                orderBy: [desc(chatSessions.updatedAt)],
                limit: 20
            });
        }),

    getSession: protectedProcedure
        .input(z.object({ sessionId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const session = await db.query.chatSessions.findFirst({
                where: and(
                    eq(chatSessions.id, input.sessionId),
                    eq(chatSessions.userId, ctx.userId!)
                ),
                with: {
                    messages: {
                        orderBy: (chatMessages, { asc }) => [asc(chatMessages.createdAt)]
                    }
                }
            });
            if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
            return session;
        }),

    deleteSession: protectedProcedure
        .input(z.object({ sessionId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(chatSessions).where(
                and(
                    eq(chatSessions.id, input.sessionId),
                    eq(chatSessions.userId, ctx.userId!)
                )
            );
            return { success: true };
        }),

    chat: protectedProcedure
        .input(z.object({
            message: z.string(),
            sessionId: z.string().uuid().optional().nullable(),
            clientRequestId: z.string().min(1).max(128).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.userId!;
            const userTier = ctx.user.subscriptionTier || 'free';
            const creditConfig = getCreditLimit(userTier, 'aiChat');
            const usage = await AiUsageService.getUsage(userId);
            const requestStartedAt = Date.now();
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const traceRequestId = input.clientRequestId?.trim() || requestId;
            const agentTrace: AgentTraceStep[] = [];
            const isNavigationIntent = /(?:how to|go to|open|navigate|take me to).*(?:page|screen|tab|route|investing|dashboard|accounts|transactions|settings|insights|budget)/i.test(input.message)
                || /(?:where is|show me).*(?:investing|dashboard|accounts|transactions|settings|insights|budget)/i.test(input.message);
            const isFinanceDataIntent = isFinanceDataIntentMessage(input.message);

            aiRouterLogger.info({
                event: 'chat.request.start',
                requestId,
                userId,
                tier: userTier,
                sessionId: input.sessionId || null,
                messageLength: input.message.length,
                usageToday: usage.questionCountToday,
                usageLifetime: usage.questionCountLifetime,
                dailyLimit: creditConfig.limit || null,
                lifetimeLimit: creditConfig.lifetimeLimit || null,
            });

            // Check limits
            if (creditConfig.limit > 0) {
                if (usage.questionCountToday >= creditConfig.limit) {
                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: `You've reached your daily limit of ${creditConfig.limit} questions. Upgrade for more!`
                    });
                }
            } else if (creditConfig.lifetimeLimit) {
                if (usage.questionCountLifetime >= creditConfig.lifetimeLimit) {
                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: `You've used all ${creditConfig.lifetimeLimit} free trial questions. Upgrade to continue chatting with Woo!`
                    });
                }
            } else {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'AI Chat is not available for your current tier.'
                });
            }

            let sessionId = input.sessionId;
            await persistAgentTrace(userId, traceRequestId, agentTrace, false);

            // Check for prompt injection
            const guard = await checkPromptGuard(input.message);
            if (!guard.isSafe) {
                aiRouterLogger.warn({
                    event: 'chat.request.blocked_by_prompt_guard',
                    requestId,
                    userId,
                    score: guard.score,
                });
                return {
                    response: "Looks like you are trying to prompt inject, huh? 🤨",
                    sessionId: sessionId || "blocked"
                };
            }

            // ... rest of the function ...
            // I'll need to increment usage later in the function.

            // 1. Create session if needed
            if (!sessionId) {
                const [newSession] = await db.insert(chatSessions).values({
                    userId,
                    title: input.message.slice(0, 30) + '...',
                }).returning();
                sessionId = newSession.id;
                aiRouterLogger.info({
                    event: 'chat.session.created',
                    requestId,
                    userId,
                    sessionId,
                });
            } else {
                // Update updated_at
                await db.update(chatSessions)
                    .set({ updatedAt: new Date() })
                    .where(eq(chatSessions.id, sessionId));
                aiRouterLogger.info({
                    event: 'chat.session.updated',
                    requestId,
                    userId,
                    sessionId,
                });
            }

            // 2. Fetch History for Context
            let dbHistory: any[] = [];
            if (input.sessionId) {
                dbHistory = await db.query.chatMessages.findMany({
                    where: eq(chatMessages.sessionId, sessionId),
                    orderBy: (chatMessages, { asc }) => [asc(chatMessages.createdAt)],
                    limit: 30
                });
            }
            aiRouterLogger.info({
                event: 'chat.history.loaded',
                requestId,
                userId,
                sessionId,
                historyCount: dbHistory.length,
            });

            // Map DB history to OpenAI messages
            const messages: ChatCompletionMessageParam[] = [];

            // 3. Gather Context & Add System Message
            let userDefaultCurrency = 'USD';
            let holdingsCount = 0;
            let topHoldings = '';
            const shouldLoadDefaultCurrency = needsDefaultCurrencyContext(input.message);
            if (isFinanceDataIntent) {
                if (shouldLoadDefaultCurrency) {
                    const userProfile = await db.query.users.findFirst({
                        where: eq(users.id, userId),
                        columns: {
                            defaultCurrency: true,
                        },
                    });
                    userDefaultCurrency = userProfile?.defaultCurrency || 'USD';
                    if (!isNavigationIntent) {
                        upsertAgentTraceStep(agentTrace, {
                            key: 'default_currency',
                            label: 'Getting your default currency',
                            detail: userDefaultCurrency,
                            status: 'done',
                        });
                        await persistAgentTrace(userId, traceRequestId, agentTrace, false);
                    }
                }

                const holdings = await db.query.portfolioHoldings.findMany({
                    where: eq(portfolioHoldings.userId, userId),
                    with: { stock: true }
                });
                holdingsCount = holdings.length;
                topHoldings = holdings.slice(0, 3).map(h => `${h.stock.ticker} (${h.quantity})`).join(', ');
            }

            const context = isFinanceDataIntent ? `
User Financial Context:
- Default Currency: ${shouldLoadDefaultCurrency ? userDefaultCurrency : 'N/A'}
- Portfolio: ${holdingsCount} positions. Top holdings: ${topHoldings}.
- Today's Date: ${new Date().toISOString().split('T')[0]}
` : `
General Context:
- Today's Date: ${new Date().toISOString().split('T')[0]}
`;
            aiRouterLogger.info({
                event: 'chat.context.built',
                requestId,
                userId,
                sessionId,
                holdingsCount,
                isFinanceDataIntent,
                contextPreview: toPreview(context, 500),
            });
            messages.push({
                role: 'system',
                content: `You are Woo, a helpful financial assistant.
Context:
${context}

Capabilities:
- You can search transactions with various filters.
- You can check account balances.
- You can check balances for a specific bank by name.
- You can list categories (use this when you need category IDs for other tools).
- You can list subscriptions and portfolio holdings.
- You can calculate current investing value using cached/live stock prices.
- You can analyze spending patterns by category.
- You can create new transactions (always confirm the details with the user first).
- You can navigate the user to pages using navigate_to.
- You can answer product-usage questions with query_docs.

Navigation rule:
- If the user asks how to open/go to/navigate to a page or section, call navigate_to with the best matching path.

Tool selection rule:
- If user asks "how much money/value is in investing/portfolio/stocks", call get_investing_value (not get_portfolio).
- If user asks balance in a specific bank (e.g., "how much in BCC bank"), call get_bank_balance with the bank name.

Currency rule:
- Always include ISO currency codes in monetary answers (e.g., USD, KZT, EUR).
- Do not assume all numbers are USD; use currency fields returned by tools.

Answer concisely and helpful. Use emojis. If you need data, use the tools provided.
`
            });

            // Add history
            for (const msg of dbHistory) {
                messages.push({
                    role: msg.role === 'model' ? 'assistant' : 'user',
                    content: msg.content
                });
            }

            // Add current user message
            messages.push({ role: 'user', content: input.message });
            aiRouterLogger.info({
                event: 'chat.messages.prepared',
                requestId,
                userId,
                sessionId,
                totalMessages: messages.length,
            });

            // 4. Save User Message to DB
            await db.insert(chatMessages).values({
                sessionId,
                role: 'user',
                content: input.message
            });

            // Fast path for explicit navigation requests.
            const resolvedPath = isNavigationIntent ? resolveNavigationPath(input.message) : null;
            if (resolvedPath) {
                const finalResponseText = `Open ${resolvedPath}`;
                const clientAction = { type: 'navigate', path: resolvedPath } as const;
                upsertAgentTraceStep(agentTrace, {
                    key: 'tool_navigate_to',
                    label: getToolDisplayLabel('navigate_to'),
                    detail: `Path: ${resolvedPath}`,
                    status: 'done',
                });
                await persistAgentTrace(userId, traceRequestId, agentTrace, true);

                await db.insert(chatMessages).values({
                    sessionId,
                    role: 'model',
                    content: finalResponseText,
                });
                await AiUsageService.incrementUsage(userId);

                aiRouterLogger.info({
                    event: 'chat.request.navigation_fast_path',
                    requestId,
                    userId,
                    sessionId,
                    path: resolvedPath,
                    durationMs: Date.now() - requestStartedAt,
                });

                return { response: finalResponseText, sessionId, clientAction, agentTrace };
            }

            // 5. Define Tools
            const tools: ChatCompletionTool[] = isFinanceDataIntent ? [
                {
                    type: "function",
                    function: {
                        name: "search_transactions",
                        description: "Search for transactions with filters. Use this when the user asks about spending history, specific expenses, or income.",
                        parameters: {
                            type: "object",
                            properties: {
                                startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
                                endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
                                categoryId: { type: "string", description: "Filter by category ID" },
                                type: { type: "string", enum: ["income", "expense", "transfer"], description: "Filter by transaction type" },
                                minAmount: { type: "number", description: "Minimum amount" },
                                maxAmount: { type: "number", description: "Maximum amount" }
                            },
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_account_balance",
                        description: "Get the current balance across all bank accounts and currencies.",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_bank_balance",
                        description: "Get balances for a specific bank by bank name (and optional account name). Use this for bank-specific balance questions.",
                        parameters: {
                            type: "object",
                            properties: {
                                bankName: { type: "string", description: "Bank name to match, e.g. 'BCC'" },
                                accountName: { type: "string", description: "Optional account name filter, e.g. 'Main Card 1821'" }
                            },
                            required: ["bankName"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_categories",
                        description: "Get all available transaction categories (both system and user-defined).",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_subscriptions",
                        description: "List the user's recurring subscriptions.",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_portfolio",
                        description: "Get the user's current stock portfolio holdings and their quantities.",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_investing_value",
                        description: "Get current market value of the user's investing portfolio using latest stock prices and existing caching layers.",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "analyze_spending",
                        description: "Get spending summary aggregated by category for a specific date range.",
                        parameters: {
                            type: "object",
                            properties: {
                                startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
                                endDate: { type: "string", description: "End date in YYYY-MM-DD format" }
                            },
                            required: ["startDate", "endDate"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "create_transaction",
                        description: "Create a new transaction. ALWAYS confirm details with the user first unless they provide all info.",
                        parameters: {
                            type: "object",
                            properties: {
                                amount: { type: "number", description: "Amount of the transaction" },
                                description: { type: "string", description: "Description or merchant name" },
                                date: { type: "string", description: "Date in YYYY-MM-DD format" },
                                categoryId: { type: "string", description: "The UUID of the category" },
                                currencyBalanceId: { type: "string", description: "The UUID of the account's currency balance" },
                                type: { type: "string", enum: ["income", "expense", "transfer"], description: "Transaction type" }
                            },
                            required: ["amount", "date", "categoryId", "currencyBalanceId", "type"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_debts_and_credits",
                        description: "Get user's debts, credits, and mortgages.",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_upcoming_payments",
                        description: "Get upcoming payments for debts, credits, mortgages, and subscriptions.",
                        parameters: {
                            type: "object",
                            properties: {
                                days: { type: "number", description: "Number of days to look ahead (default 30)" }
                            }
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_net_worth_breakdown",
                        description: "Get a breakdown of net worth by bank/asset, converted to user's default currency.",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "navigate_to",
                        description: "Navigate the user to a specific page in the app.",
                        parameters: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    enum: ["/dashboard", "/transactions", "/accounts", "/investing", "/insights", "/settings", "/budget"],
                                    description: " The path to navigate to."
                                }
                            },
                            required: ["path"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "query_docs",
                        description: "Search the app documentation/help center for answers about how to use the app.",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "The search query" }
                            },
                            required: ["query"]
                        }
                    }
                }
            ] : [
                {
                    type: "function",
                    function: {
                        name: "navigate_to",
                        description: "Navigate the user to a specific page in the app.",
                        parameters: {
                            type: "object",
                            properties: {
                                path: {
                                    type: "string",
                                    enum: ["/dashboard", "/transactions", "/accounts", "/investing", "/insights", "/settings", "/budget"],
                                    description: " The path to navigate to."
                                }
                            },
                            required: ["path"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "query_docs",
                        description: "Search the app documentation/help center for answers about how to use the app.",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "The search query" }
                            },
                            required: ["query"]
                        }
                    }
                }
            ];
            aiRouterLogger.info({
                event: 'chat.tools.registered',
                requestId,
                userId,
                sessionId,
                toolCount: tools.length,
                toolNames: tools
                    .map((t) => t.type === 'function' ? t.function.name : 'unknown')
                    .filter(Boolean),
            });

            try {
                // 6. Chat Loop
                let finalResponseText = "";

                // Max 5 turns to prevent infinite loops
                for (let i = 0; i < 5; i++) {
                    const turnStartedAt = Date.now();
                    aiRouterLogger.info({
                        event: 'chat.turn.start',
                        requestId,
                        userId,
                        sessionId,
                        turn: i + 1,
                        messageCount: messages.length,
                    });
                    const completion = await createChatCompletionWithFallback(
                        {
                            model: MODEL_FLASH,
                            messages: messages,
                            ...(tools.length > 0 ? { tools: tools, tool_choice: "auto" as const } : {}),
                        },
                        {
                            purpose: 'chat',
                            // If OpenAI is used as fallback, it may need a different model than OpenRouter.
                            models: {
                                openrouter: MODEL_FLASH,
                                openai: process.env.OPENAI_CHAT_MODEL,
                            },
                        }
                    );

                    const responseMessage = completion.choices[0].message;
                    aiRouterLogger.info({
                        event: 'chat.turn.response',
                        requestId,
                        userId,
                        sessionId,
                        turn: i + 1,
                        durationMs: Date.now() - turnStartedAt,
                        finishReason: completion.choices[0]?.finish_reason ?? null,
                        hasToolCalls: Boolean(responseMessage.tool_calls?.length),
                        contentPreview: toPreview(responseMessage.content, 500),
                    });

                    // Add assistant response to history
                    messages.push(responseMessage);

                    if (responseMessage.tool_calls) {
                        for (const toolCall of responseMessage.tool_calls) {
                            if (toolCall.type !== 'function') continue;
                            let args: any = {};
                            try {
                                args = JSON.parse(toolCall.function.arguments);
                            } catch (error) {
                                aiRouterLogger.error({
                                    event: 'chat.tool_call.invalid_arguments',
                                    requestId,
                                    userId,
                                    sessionId,
                                    turn: i + 1,
                                    toolCallId: toolCall.id,
                                    toolName: toolCall.function.name,
                                    rawArguments: toolCall.function.arguments,
                                    error: error instanceof Error ? error.message : String(error),
                                });
                                args = {};
                            }
                            aiRouterLogger.info({
                                event: 'chat.tool_call.start',
                                requestId,
                                userId,
                                sessionId,
                                turn: i + 1,
                                toolCallId: toolCall.id,
                                toolName: toolCall.function.name,
                                argumentsPreview: toPreview(args),
                            });
                            let toolResult: any = { error: "Unknown tool or execution failed" };
                            const toolStartedAt = Date.now();
                            const toolTraceKey = `tool_${toolCall.function.name}`;
                            upsertAgentTraceStep(agentTrace, {
                                key: toolTraceKey,
                                label: getToolDisplayLabel(toolCall.function.name),
                                status: 'running',
                            });
                            await persistAgentTrace(userId, traceRequestId, agentTrace, false);

                            if (toolCall.function.name === "search_transactions") {
                                const userBanks = await db.query.banks.findMany({ where: eq(banks.userId, userId) });
                                let txs: any[] = [];
                                if (userBanks.length > 0) {
                                    const bankIds = userBanks.map(b => b.id);
                                    const userAccounts = await db.query.accounts.findMany({ where: inArray(accounts.bankId, bankIds) });
                                    if (userAccounts.length > 0) {
                                        const accountIds = userAccounts.map(a => a.id);
                                        const userBalances = await db.query.currencyBalances.findMany({ where: inArray(currencyBalances.accountId, accountIds) });
                                        if (userBalances.length > 0) {
                                            const balanceIds = userBalances.map(b => b.id);
                                            const conditions = [inArray(transactions.currencyBalanceId, balanceIds)];
                                            if (args.startDate) conditions.push(gte(transactions.date, args.startDate));
                                            if (args.endDate) conditions.push(lte(transactions.date, args.endDate));
                                            if (args.categoryId) conditions.push(eq(transactions.categoryId, args.categoryId));
                                            if (args.type) conditions.push(eq(transactions.type, args.type));
                                            if (args.minAmount) conditions.push(gte(transactions.amount, args.minAmount.toString()));
                                            if (args.maxAmount) conditions.push(lte(transactions.amount, args.maxAmount.toString()));

                                            txs = await db.query.transactions.findMany({
                                                where: and(...conditions),
                                                with: { category: true },
                                                orderBy: [desc(transactions.date)],
                                                limit: 50
                                            });
                                        }
                                    }
                                }
                                toolResult = {
                                    transactions: txs.map(t => ({
                                        id: t.id,
                                        date: t.date,
                                        amount: t.amount,
                                        description: t.description,
                                        category: t.category.name,
                                        type: t.type
                                    }))
                                };
                            } else if (toolCall.function.name === "get_account_balance") {
                                const userBalances = await db.query.banks.findMany({
                                    where: eq(banks.userId, userId),
                                    with: { accounts: { with: { currencyBalances: true } } }
                                });
                                toolResult = {
                                    banks: userBalances.map(b => ({
                                        name: b.name,
                                        accounts: b.accounts.map(a => ({
                                            name: a.name,
                                            type: a.type,
                                            balances: a.currencyBalances.map(cb => ({
                                                id: cb.id,
                                                amount: cb.balance,
                                                currency: cb.currencyCode
                                            }))
                                        }))
                                    }))
                                };
                            } else if (toolCall.function.name === "get_bank_balance") {
                                const bankNameQuery = String(args.bankName || '').trim();
                                const accountNameQuery = String(args.accountName || '').trim().toLowerCase();

                                if (!bankNameQuery) {
                                    toolResult = { error: "bankName is required" };
                                } else {
                                    const bankNameLower = bankNameQuery.toLowerCase();
                                    const userBanks = await db.query.banks.findMany({
                                        where: eq(banks.userId, userId),
                                        with: { accounts: { with: { currencyBalances: true } } }
                                    });

                                    const matchedBanks = userBanks.filter((b) =>
                                        String(b.name || '').toLowerCase().includes(bankNameLower)
                                    );
                                    const exactMatch = matchedBanks.find((b) =>
                                        String(b.name || '').toLowerCase() === bankNameLower
                                    );
                                    const orderedBanks = exactMatch
                                        ? [exactMatch, ...matchedBanks.filter((b) => b.id !== exactMatch.id)]
                                        : matchedBanks;

                                    const mappedBanks = orderedBanks.map((b) => {
                                        const accountsList = accountNameQuery
                                            ? b.accounts.filter((a) => String(a.name || '').toLowerCase().includes(accountNameQuery))
                                            : b.accounts;

                                        const totalsByCurrency: Record<string, number> = {};
                                        for (const account of accountsList) {
                                            for (const cb of account.currencyBalances) {
                                                const currency = String(cb.currencyCode || 'UNKNOWN').toUpperCase();
                                                totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + Number(cb.balance || 0);
                                            }
                                        }

                                        return {
                                            name: b.name,
                                            totalsByCurrency: Object.fromEntries(
                                                Object.entries(totalsByCurrency).map(([currency, amount]) => [currency, Number(amount.toFixed(2))])
                                            ),
                                            accounts: accountsList.map((a) => ({
                                                id: a.id,
                                                name: a.name,
                                                type: a.type,
                                                balances: a.currencyBalances.map((cb) => ({
                                                    id: cb.id,
                                                    amount: Number(cb.balance),
                                                    currency: cb.currencyCode,
                                                })),
                                            })),
                                        };
                                    });

                                    toolResult = {
                                        query: {
                                            bankName: bankNameQuery,
                                            accountName: accountNameQuery || null,
                                        },
                                        matchedBankCount: mappedBanks.length,
                                        primaryMatch: mappedBanks[0] || null,
                                        banks: mappedBanks,
                                    };
                                }
                            } else if (toolCall.function.name === "get_categories") {
                                const allCategories = await db.query.categories.findMany({
                                    where: sql`${categories.userId} IS NULL OR ${categories.userId} = ${userId}`
                                });
                                toolResult = { categories: allCategories.map(c => ({ id: c.id, name: c.name, type: c.type, icon: c.icon })) };
                            } else if (toolCall.function.name === "get_subscriptions") {
                                const userSubs = await db.query.subscriptions.findMany({
                                    where: eq(subscriptions.userId, userId)
                                });
                                toolResult = { subscriptions: userSubs.map(s => ({ id: s.id, name: s.name, amount: s.amount, currency: s.currency, frequency: s.frequency, status: s.status })) };
                            } else if (toolCall.function.name === "get_portfolio") {
                                const userHoldings = await db.query.portfolioHoldings.findMany({
                                    where: eq(portfolioHoldings.userId, userId),
                                    with: { stock: true }
                                });
                                toolResult = { holdings: userHoldings.map(h => ({ ticker: h.stock.ticker, name: h.stock.name, quantity: h.quantity, avgCost: h.averageCostBasis })) };
                            } else if (toolCall.function.name === "get_investing_value") {
                                const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
                                const defaultCurrency = user?.defaultCurrency || 'USD';
                                const summary = await analyticsService.calculatePortfolioSummary(userId);

                                toolResult = {
                                    currency: defaultCurrency,
                                    totalInvestingValue: summary.totalPortfolioValue.toFixed(2),
                                    stockValue: summary.stockValue.toFixed(2),
                                    cashValue: summary.cash.totalCash.toFixed(2),
                                    positions: summary.holdings.map((h) => ({
                                        ticker: h.ticker,
                                        name: h.name,
                                        quantity: h.quantity,
                                        currentPrice: h.currentPrice,
                                        currentValue: h.currentValue,
                                        currency: h.currency,
                                        lastUpdated: h.lastUpdated,
                                        isStale: h.isStale,
                                    })),
                                };
                            } else if (toolCall.function.name === "analyze_spending") {
                                const userBanks = await db.query.banks.findMany({ where: eq(banks.userId, userId) });
                                let analysis: any[] = [];
                                if (userBanks.length > 0) {
                                    const bankIds = userBanks.map(b => b.id);
                                    const userAccounts = await db.query.accounts.findMany({ where: inArray(accounts.bankId, bankIds) });
                                    if (userAccounts.length > 0) {
                                        const accountIds = userAccounts.map(a => a.id);
                                        const userBalances = await db.query.currencyBalances.findMany({ where: inArray(currencyBalances.accountId, accountIds) });
                                        if (userBalances.length > 0) {
                                            const balanceIds = userBalances.map(b => b.id);
                                            analysis = await db.select({
                                                categoryName: categories.name,
                                                totalAmount: sum(transactions.amount),
                                                count: sql`count(*)`.mapWith(Number)
                                            })
                                                .from(transactions)
                                                .leftJoin(categories, eq(transactions.categoryId, categories.id))
                                                .where(and(
                                                    inArray(transactions.currencyBalanceId, balanceIds),
                                                    gte(transactions.date, args.startDate),
                                                    lte(transactions.date, args.endDate),
                                                    eq(transactions.type, 'expense')
                                                ))
                                                .groupBy(categories.name);
                                        }
                                    }
                                }
                                toolResult = { spending_by_category: analysis };
                            } else if (toolCall.function.name === "create_transaction") {
                                // Validate ownership of currencyBalanceId
                                const balance = await db.query.currencyBalances.findFirst({
                                    where: eq(currencyBalances.id, args.currencyBalanceId),
                                    with: { account: { with: { bank: true } } }
                                });

                                if (!balance || balance.account.bank.userId !== userId) {
                                    toolResult = { error: "Invalid account or access denied" };
                                } else {
                                    const [newTx] = await db.insert(transactions).values({
                                        currencyBalanceId: args.currencyBalanceId,
                                        categoryId: args.categoryId,
                                        amount: args.amount.toString(),
                                        description: args.description || "Added via AI",
                                        date: args.date,
                                        type: args.type
                                    }).returning();
                                    toolResult = { success: true, transactionId: newTx.id };
                                }
                            } else if (toolCall.function.name === "get_debts_and_credits") {
                                const user = await db.query.users.findFirst({
                                    where: eq(users.id, userId),
                                    columns: { defaultCurrency: true }
                                });
                                const defaultCurrency = user?.defaultCurrency || 'USD';

                                const rates = await db.query.fxRates.findMany({
                                    where: eq(fxRates.toCurrency, defaultCurrency),
                                    orderBy: [desc(fxRates.date)],
                                    limit: 200
                                });
                                const rateMap = new Map<string, number>();
                                for (const r of rates) {
                                    if (!rateMap.has(r.fromCurrency)) {
                                        rateMap.set(r.fromCurrency, Number(r.rate));
                                    }
                                }
                                rateMap.set(defaultCurrency, 1);

                                const convertToDefault = (amount: number, currency: string): number | null => {
                                    const normalized = (currency || defaultCurrency).toUpperCase();
                                    const rate = rateMap.get(normalized);
                                    if (rate === undefined) return null;
                                    return amount * rate;
                                };

                                const userDebts = await db.query.debts.findMany({
                                    where: and(eq(debts.userId, userId), eq(debts.lifecycleStatus, 'active')),
                                    with: {
                                        currencyBalance: {
                                            columns: {
                                                currencyCode: true,
                                            },
                                        },
                                    },
                                });
                                // Credits and mortgages are linked to accounts, need to fetch user accounts first
                                const userBanks = await db.query.banks.findMany({ where: eq(banks.userId, userId) });
                                const bankIds = userBanks.map(b => b.id);
                                let creditsList: any[] = [];
                                let mortgagesList: any[] = [];

                                if (bankIds.length > 0) {
                                    const userAccounts = await db.query.accounts.findMany({ where: inArray(accounts.bankId, bankIds) });
                                    if (userAccounts.length > 0) {
                                        const accountIds = userAccounts.map(a => a.id);
                                        creditsList = await db.query.credits.findMany({ where: inArray(credits.accountId, accountIds) });
                                        mortgagesList = await db.query.mortgages.findMany({ where: inArray(mortgages.accountId, accountIds) });
                                    }
                                }

                                let totalDebtsIOweDefault = 0;
                                let totalCreditsDefault = 0;
                                let totalMortgagesDefault = 0;
                                let totalTheyOweMeDefault = 0;
                                const missingRateCurrencies = new Set<string>();

                                const debtItems = userDebts.map((d) => {
                                    const currency = (d.currencyCode || d.currencyBalance?.currencyCode || defaultCurrency).toUpperCase();
                                    const outstanding = Math.max(Number(d.amount) - Number(d.paidAmount), 0);
                                    const converted = convertToDefault(outstanding, currency);
                                    if (converted === null) {
                                        missingRateCurrencies.add(currency);
                                    } else if (d.type === 'i_owe') {
                                        totalDebtsIOweDefault += converted;
                                    } else if (d.type === 'they_owe') {
                                        totalTheyOweMeDefault += converted;
                                    }
                                    return {
                                        person: d.personName,
                                        type: d.type,
                                        status: d.status,
                                        amount: Number(d.amount),
                                        paidAmount: Number(d.paidAmount),
                                        outstanding,
                                        currency,
                                        outstandingInDefaultCurrency: converted === null ? null : Number(converted.toFixed(2)),
                                    };
                                });

                                const creditItems = creditsList.map((c) => {
                                    const currency = String(c.currency || defaultCurrency).toUpperCase();
                                    const remaining = Number(c.remainingBalance);
                                    const converted = convertToDefault(remaining, currency);
                                    if (converted === null) {
                                        missingRateCurrencies.add(currency);
                                    } else {
                                        totalCreditsDefault += converted;
                                    }
                                    return {
                                        name: c.name,
                                        principal: Number(c.principalAmount),
                                        remaining,
                                        monthly: Number(c.monthlyPayment),
                                        currency,
                                        remainingInDefaultCurrency: converted === null ? null : Number(converted.toFixed(2)),
                                    };
                                });

                                const mortgageItems = mortgagesList.map((m) => {
                                    const currency = String(m.currency || defaultCurrency).toUpperCase();
                                    const remaining = Number(m.remainingBalance);
                                    const converted = convertToDefault(remaining, currency);
                                    if (converted === null) {
                                        missingRateCurrencies.add(currency);
                                    } else {
                                        totalMortgagesDefault += converted;
                                    }
                                    return {
                                        property: m.propertyName,
                                        remaining,
                                        monthly: Number(m.monthlyPayment),
                                        currency,
                                        remainingInDefaultCurrency: converted === null ? null : Number(converted.toFixed(2)),
                                    };
                                });

                                toolResult = {
                                    defaultCurrency,
                                    totals: {
                                        debtsIOwe: Number(totalDebtsIOweDefault.toFixed(2)),
                                        credits: Number(totalCreditsDefault.toFixed(2)),
                                        mortgages: Number(totalMortgagesDefault.toFixed(2)),
                                        totalLiabilities: Number((totalDebtsIOweDefault + totalCreditsDefault + totalMortgagesDefault).toFixed(2)),
                                        theyOweMe: Number(totalTheyOweMeDefault.toFixed(2)),
                                    },
                                    debts: debtItems,
                                    credits: creditItems,
                                    mortgages: mortgageItems,
                                    missingRateCurrencies: Array.from(missingRateCurrencies),
                                };
                            } else if (toolCall.function.name === "get_upcoming_payments") {
                                const days = args.days || 30;
                                const today = new Date();
                                const futureDate = new Date();
                                futureDate.setDate(today.getDate() + days);

                                // Simplified logic: just returning the recurring items for now as "upcoming" candidates
                                // In a real app, we'd calculate exact next payment dates based on billing cycles
                                const userSubs = await db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId) });

                                // Get debts/credits/mortgages (similar fetching logic as above)
                                const userBanks = await db.query.banks.findMany({ where: eq(banks.userId, userId) });
                                const bankIds = userBanks.map(b => b.id);
                                let creditsList: any[] = [];
                                let mortgagesList: any[] = [];
                                if (bankIds.length > 0) {
                                    const userAccounts = await db.query.accounts.findMany({ where: inArray(accounts.bankId, bankIds) });
                                    if (userAccounts.length > 0) {
                                        const accountIds = userAccounts.map(a => a.id);
                                        creditsList = await db.query.credits.findMany({ where: inArray(credits.accountId, accountIds) });
                                        mortgagesList = await db.query.mortgages.findMany({ where: inArray(mortgages.accountId, accountIds) });
                                    }
                                }

                                toolResult = {
                                    subscriptions: userSubs.map(s => ({ name: s.name, amount: s.amount, frequency: s.frequency, nextDate: "Check billing day " + s.billingDay })),
                                    credits: creditsList.map(c => ({ name: c.name, amount: c.monthlyPayment, nextDate: "Monthly" })),
                                    mortgages: mortgagesList.map(m => ({ name: m.propertyName, amount: m.monthlyPayment, nextDate: "Monthly on day " + m.paymentDay }))
                                };
                            } else if (toolCall.function.name === "get_net_worth_breakdown") {
                                const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
                                const defaultCurrency = user?.defaultCurrency || 'USD';

                                // Mock FX rates for now or fetch latest
                                // Ideally we fetch from fxRates table
                                const rates = await db.query.fxRates.findMany({
                                    where: eq(fxRates.toCurrency, defaultCurrency),
                                    orderBy: [desc(fxRates.date)],
                                    limit: 50 // Get recent rates
                                });
                                // Create a Map for quick lookup: fromCurrency -> rate
                                const rateMap = new Map<string, number>();
                                rates.forEach(r => rateMap.set(r.fromCurrency, Number(r.rate)));
                                rateMap.set(defaultCurrency, 1); // Base case

                                const userBanks = await db.query.banks.findMany({
                                    where: eq(banks.userId, userId),
                                    with: { accounts: { with: { currencyBalances: true } } }
                                });

                                let totalNetWorth = 0;
                                const breakdown = userBanks.map(b => {
                                    let bankTotal = 0;
                                    b.accounts.forEach(a => {
                                        a.currencyBalances.forEach(cb => {
                                            const rate = rateMap.get(cb.currencyCode) || 1; // Fallback to 1 if no rate found (simplified)
                                            // TODO: Handle missing rates more gracefully in production
                                            bankTotal += Number(cb.balance) * rate;
                                        });
                                    });
                                    totalNetWorth += bankTotal;
                                    return { bankName: b.name, totalValue: bankTotal.toFixed(2), currency: defaultCurrency };
                                });

                                // Sort by highest value
                                breakdown.sort((a, b) => Number(b.totalValue) - Number(a.totalValue));

                                toolResult = {
                                    defaultCurrency,
                                    totalNetWorth: totalNetWorth.toFixed(2),
                                    breakdown
                                };
                            } else if (toolCall.function.name === "navigate_to") {
                                toolResult = { success: true, path: args.path };
                            } else if (toolCall.function.name === "query_docs") {
                                const docs = [
                                    { topic: "Dashboard", keywords: ["dashboard", "home", "overview", "summary"], content: "The Dashboard shows your net worth, recent transactions, and active accounts. You can customize widgets here." },
                                    { topic: "Transactions", keywords: ["transaction", "add", "edit", "delete", "spending", "expense", "income"], content: "Go to the Transactions page to view history. Click 'Add Transaction' to log spending. You can filter by date, category, or account." },
                                    { topic: "Accounts", keywords: ["account", "bank", "card", "manual", "sync"], content: "The Accounts page lists all connected banks and manual accounts. You can link new banks via Plaid or add manual cash wallets." },
                                    { topic: "Insights", keywords: ["insight", "report", "graph", "chart", "analysis"], content: "Insights provide visual reports of your finances. View spending by category, monthly trends, and income vs expense flows." },
                                    { topic: "Settings", keywords: ["setting", "preference", "currency", "theme", "profile"], content: "Manage your profile, default currency, app theme (dark/light), and notification preferences in Settings." },
                                    { topic: "Budgets", keywords: ["budget", "limit", "save", "goal"], content: "Set monthly spending limits for specific categories in the Budgets section to track your saving goals." },
                                    { topic: "AI Chat", keywords: ["ai", "woo", "chat", "assistant", "help"], content: "Woo is your AI assistant. Ask it about your spending, to add transactions, or for financial advice. It can search your data and perform actions." }
                                ];

                                const query = args.query.toLowerCase();
                                const results = docs.filter(d =>
                                    d.topic.toLowerCase().includes(query) ||
                                    d.keywords.some(k => query.includes(k)) ||
                                    d.content.toLowerCase().includes(query)
                                ).map(d => `${d.topic}: ${d.content}`);

                                toolResult = {
                                    results: results.length > 0 ? results : ["No specific help article found. Try navigating to the relevant page or asking differently."]
                                };
                            }

                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify(toolResult)
                            });
                            upsertAgentTraceStep(agentTrace, {
                                key: toolTraceKey,
                                label: getToolDisplayLabel(toolCall.function.name),
                                detail: summarizeToolResult(toolCall.function.name, toolResult),
                                status: 'done',
                            });
                            await persistAgentTrace(userId, traceRequestId, agentTrace, false);
                            aiRouterLogger.info({
                                event: 'chat.tool_call.complete',
                                requestId,
                                userId,
                                sessionId,
                                turn: i + 1,
                                toolCallId: toolCall.id,
                                toolName: toolCall.function.name,
                                durationMs: Date.now() - toolStartedAt,
                                resultPreview: toPreview(toolResult),
                            });
                        }
                        // Continue loop to get fresh response after tool outputs
                    } else {
                        // No tool calls, final response
                        finalResponseText = responseMessage.content || "";
                        aiRouterLogger.info({
                            event: 'chat.turn.final_response',
                            requestId,
                            userId,
                            sessionId,
                            turn: i + 1,
                            responseLength: finalResponseText.length,
                        });
                        break;
                    }
                }

                // Check if the FINAL turn contained a navigation action
                // We typically want to execute the action if the tool was called.
                // Scan all tool calls in the conversation added during this session.
                let clientAction = null;
                // iterate backwards to find the last navigation
                for (let i = messages.length - 1; i >= 0; i--) {
                    const msg = messages[i];
                    if (msg.role === 'assistant' && msg.tool_calls) {
                        const navCall = msg.tool_calls.find(tc => tc.type === 'function' && tc.function.name === "navigate_to");
                        if (navCall && navCall.type === 'function') {
                            const args = JSON.parse(navCall.function.arguments);
                            clientAction = { type: 'navigate', path: args.path };
                            aiRouterLogger.info({
                                event: 'chat.client_action.detected',
                                requestId,
                                userId,
                                sessionId,
                                actionType: 'navigate',
                                path: args.path,
                            });
                            break;
                        }
                    }
                    // Stop if we hit user message (only look at current turn chains)
                    if (msg.role === 'user') break;
                }

                // 7. Save Model Response
                await db.insert(chatMessages).values({
                    sessionId,
                    role: 'model',
                    content: finalResponseText || "(No response)"
                });

                // Increment usage
                await AiUsageService.incrementUsage(userId);
                aiRouterLogger.info({
                    event: 'chat.request.complete',
                    requestId,
                    userId,
                    sessionId,
                    durationMs: Date.now() - requestStartedAt,
                    responseLength: finalResponseText.length,
                    hasClientAction: Boolean(clientAction),
                });

                await persistAgentTrace(userId, traceRequestId, agentTrace, true);
                return { response: finalResponseText, sessionId, clientAction, agentTrace };
            } catch (error: any) {
                upsertAgentTraceStep(agentTrace, {
                    key: 'error',
                    label: 'Request failed',
                    detail: error?.message || 'Unknown error',
                    status: 'done',
                });
                await persistAgentTrace(userId, traceRequestId, agentTrace, true);
                aiRouterLogger.error({
                    event: 'chat.request.failed',
                    requestId,
                    userId,
                    sessionId,
                    durationMs: Date.now() - requestStartedAt,
                    error: error?.message || String(error),
                    stack: error?.stack,
                });
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message || 'AI Service Error' });
            }
        }),

    // Admin endpoints for managing AI configuration
    getAiConfig: protectedProcedure
        .query(async ({ ctx }) => {
            // TODO: Add admin check
            const config = await AiConfigService.getConfig();
            return config;
        }),

    updateAiConfig: protectedProcedure
        .input(z.object({
            providerOrder: z.array(z.enum(['openrouter', 'openai', 'gemini', 'groq'])).optional(),
            defaultProvider: z.enum(['openrouter', 'openai', 'gemini', 'groq']).optional(),
            modelSettings: z.object({
                openrouter: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
                openai: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
                gemini: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
                groq: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
            }).optional(),
            fallbackEnabled: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // TODO: Add admin check
            const updatedConfig = await AiConfigService.updateConfig(input);
            return updatedConfig;
        }),

    resetAiConfig: protectedProcedure
        .mutation(async ({ ctx }) => {
            // TODO: Add admin check
            const resetConfig = await AiConfigService.resetToDefault();
            return resetConfig;
        }),

    getAiStatus: protectedProcedure
        .query(async ({ ctx }) => {
            // TODO: Add admin check
            return await getAiStatus();
        }),
});
