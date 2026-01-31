import { router, protectedProcedure } from '../lib/trpc';
import { digestService } from '../services/ai/digest-service';
import { anomalyService } from '../services/ai/anomaly-service';
import { db } from '../db';
import { transactions, portfolioHoldings, accounts, currencyBalances, chatSessions, chatMessages, banks } from '../db/schema';
import { createChatCompletionWithFallback, MODEL_FLASH } from '../lib/ai';
import { desc, eq, and, gte, lte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export const aiRouter = router({
    getDailyDigest: protectedProcedure
        .query(async ({ ctx }) => {
            return await digestService.generateDailyDigest(ctx.userId!);
        }),

    getSpendingAnomalies: protectedProcedure
        .query(async ({ ctx }) => {
            return await anomalyService.detectSpendingAnomalies(ctx.userId!);
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
        .query(async ({ ctx, input }) => {
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
            let sessionId = input.sessionId;

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

                return { response: finalResponseText, sessionId };

            } catch (error: any) {
                console.error("AI Error:", error);
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message || 'AI Service Error' });
            }
        }),
});
