import { router, protectedProcedure } from '../lib/trpc';
import { digestService } from '../services/ai/digest-service';
import { anomalyService } from '../services/ai/anomaly-service';
import { AiConfigService } from '../services/ai/ai-config-service';
import { AiUsageService } from '../services/ai/ai-usage-service';
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

Capabilities:
- You can search transactions with various filters.
- You can check account balances.
- You can list categories (use this when you need category IDs for other tools).
- You can list subscriptions and portfolio holdings.
- You can analyze spending patterns by category.
- You can create new transactions (always confirm the details with the user first).

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
                                    enum: ["/dashboard", "/transactions", "/accounts", "/insights", "/settings", "/budget"],
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
                            const args = JSON.parse(toolCall.function.arguments);
                            let toolResult: any = { error: "Unknown tool or execution failed" };

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
                                const userDebts = await db.query.debts.findMany({ where: eq(debts.userId, userId) });
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

                                toolResult = {
                                    debts: userDebts.map(d => ({ person: d.personName, amount: d.amount, type: d.type, status: d.status })),
                                    credits: creditsList.map(c => ({ name: c.name, principal: c.principalAmount, remaining: c.remainingBalance, monthly: c.monthlyPayment })),
                                    mortgages: mortgagesList.map(m => ({ property: m.propertyName, remaining: m.remainingBalance, monthly: m.monthlyPayment }))
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
                        }
                        // Continue loop to get fresh response after tool outputs
                    } else {
                        // No tool calls, final response
                        finalResponseText = responseMessage.content || "";
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

                return { response: finalResponseText, sessionId, clientAction };
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
