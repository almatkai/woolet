import { router, protectedProcedure } from '../lib/trpc';
import { digestService } from '../services/ai/digest-service';
import { anomalyService } from '../services/ai/anomaly-service';
import { AiConfigService } from '../services/ai/ai-config-service';
import { AiUsageService } from '../services/ai/ai-usage-service';
import { db } from '../db';
import { transactions, portfolioHoldings, accounts, currencyBalances, chatSessions, chatMessages, banks, marketDigests, aiConfig } from '../db/schema';
import { createChatCompletionWithFallback, MODEL_FLASH, checkPromptGuard, getAiStatus } from '../lib/ai';
import { desc, asc, eq, and, gte, lte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TIER_LIMITS } from './bank';
import { getAiDigestLength } from '../lib/checkLimit';
import { getCreditLimit } from '@woolet/shared';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

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
            
            const tierTitle = userTier === 'premium' 
                ? 'Woo Assistant' 
                : userTier === 'pro' 
                    ? 'Woo Assistant (Limited)' 
                    : 'Woo Assistant (Trial)';

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
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.userId!;
            const userTier = ctx.user.subscriptionTier || 'free';
            const creditConfig = getCreditLimit(userTier, 'aiChat');
            const usage = await AiUsageService.getUsage(userId);

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

            // Check for prompt injection
            const guard = await checkPromptGuard(input.message);
            if (!guard.isSafe) {
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
            } else {
                // Update updated_at
                await db.update(chatSessions)
                    .set({ updatedAt: new Date() })
                    .where(eq(chatSessions.id, sessionId));
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

            // Map DB history to OpenAI messages
            const messages: ChatCompletionMessageParam[] = [];

            // 3. Gather Context & Add System Message
            const holdings = await db.query.portfolioHoldings.findMany({
                where: eq(portfolioHoldings.userId, userId),
                with: { stock: true }
            });
            const context = `
User Financial Context:
- Portfolio: ${holdings.length} positions. Top holdings: ${holdings.slice(0, 3).map(h => `${h.stock.ticker} (${h.quantity})`).join(', ')}.
- Today's Date: ${new Date().toISOString().split('T')[0]}
`;
            messages.push({
                role: 'system',
                content: `You are Woo, a helpful financial assistant.
Context:
${context}

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

            // 4. Save User Message to DB
            await db.insert(chatMessages).values({
                sessionId,
                role: 'user',
                content: input.message
            });

            // 5. Define Tools
            const tools: ChatCompletionTool[] = [
                {
                    type: "function",
                    function: {
                        name: "search_transactions",
                        description: "Search for transactions within a specific date range. ALWAYS use this tool when the user asks about spending on a specific date or period.",
                        parameters: {
                            type: "object",
                            properties: {
                                startDate: {
                                    type: "string",
                                    description: "Start date in YYYY-MM-DD format"
                                },
                                endDate: {
                                    type: "string",
                                    description: "End date in YYYY-MM-DD format"
                                }
                            },
                            required: ["startDate", "endDate"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_account_balance",
                        description: "Get the current balance across all bank accounts and currencies. Useful when user asks 'How much money do I have?' or 'What is my balance?'",
                        parameters: {
                            type: "object",
                            properties: {
                                dummy: {
                                    type: "string",
                                    description: "Not used"
                                }
                            }
                        }
                    }
                }
            ];

            try {
                // 6. Chat Loop
                let finalResponseText = "";

                // Max 5 turns to prevent infinite loops
                for (let i = 0; i < 5; i++) {
                    const completion = await createChatCompletionWithFallback(
                        {
                            model: MODEL_FLASH,
                            messages: messages,
                            tools: tools,
                            tool_choice: "auto",
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

                    // Add assistant response to history
                    messages.push(responseMessage);

                    if (responseMessage.tool_calls) {
                        for (const toolCall of responseMessage.tool_calls) {
                            if (toolCall.type !== 'function') continue;

                            if (toolCall.function.name === "search_transactions") {
                                const args = JSON.parse(toolCall.function.arguments);

                                // Execute logic
                                // 1. Get user's banks
                                const userBanks = await db.query.banks.findMany({
                                    where: eq(banks.userId, userId),
                                });

                                let txs: any[] = [];
                                if (userBanks.length > 0) {
                                    const bankIds = userBanks.map(b => b.id);
                                    const userAccounts = await db.query.accounts.findMany({
                                        where: inArray(accounts.bankId, bankIds)
                                    });

                                    if (userAccounts.length > 0) {
                                        const accountIds = userAccounts.map(a => a.id);
                                        const userBalances = await db.query.currencyBalances.findMany({
                                            where: inArray(currencyBalances.accountId, accountIds)
                                        });

                                        if (userBalances.length > 0) {
                                            const balanceIds = userBalances.map(b => b.id);
                                            txs = await db.query.transactions.findMany({
                                                where: and(
                                                    inArray(transactions.currencyBalanceId, balanceIds),
                                                    gte(transactions.date, args.startDate),
                                                    lte(transactions.date, args.endDate)
                                                ),
                                                with: { category: true },
                                                orderBy: [desc(transactions.date)]
                                            });
                                        }
                                    }
                                }

                                const toolResult = {
                                    transactions: txs.map(t => ({
                                        date: t.date,
                                        amount: t.amount,
                                        description: t.description,
                                        category: t.category.name
                                    }))
                                };

                                messages.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    content: JSON.stringify(toolResult)
                                });
                            } else if (toolCall.function.name === "get_account_balance") {
                                // 1. Get user's banks with accounts and balances
                                const userBalances = await db.query.banks.findMany({
                                    where: eq(banks.userId, userId),
                                    with: {
                                        accounts: {
                                            with: {
                                                currencyBalances: true
                                            }
                                        }
                                    }
                                });

                                const toolResult = {
                                    banks: userBalances.map(b => ({
                                        name: b.name,
                                        accounts: b.accounts.map(a => ({
                                            name: a.name,
                                            type: a.type,
                                            balances: a.currencyBalances.map(cb => ({
                                                amount: cb.balance,
                                                currency: cb.currencyCode
                                            }))
                                        }))
                                    }))
                                };

                                messages.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    content: JSON.stringify(toolResult)
                                });
                            }
                        }
                        // Continue loop to get fresh response after tool outputs
                    } else {
                        // No tool calls, final response
                        finalResponseText = responseMessage.content || "";
                        break;
                    }
                }

                // 7. Save Model Response
                await db.insert(chatMessages).values({
                    sessionId,
                    role: 'model',
                    content: finalResponseText || "(No response)"
                });

                // Increment usage
                await AiUsageService.incrementUsage(userId);

                return { response: finalResponseText, sessionId };

            } catch (error: any) {
                console.error("AI Error:", error);
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
