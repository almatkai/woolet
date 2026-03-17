import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { getCreditLimit } from '@woolet/shared';
import { db } from '../../db';
import { chatMessages, chatSessions, portfolioHoldings } from '../../db/schema';
import { checkPromptGuard, createChatCompletionWithFallback, MODEL_FLASH } from '../../lib/ai';
import {
  executeCapability,
  getCapabilityManifest,
  isCapabilityReadOnly,
  type CapabilityAction,
} from './capability-registry';
import { AiUsageService } from './ai-usage-service';

const MAX_CHAT_TOOL_TURNS = 5;
const CHAT_HISTORY_LIMIT = 30;

const chatTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_capability_manifest',
      description: 'Return all supported capability IDs, schemas, and metadata.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_capability',
      description: 'Execute one capability from the manifest with validated arguments.',
      parameters: {
        type: 'object',
        properties: {
          capabilityId: { type: 'string' },
          args: { type: 'object', additionalProperties: true },
          dryRun: { type: 'boolean' },
          confirmationToken: { type: 'string' },
          idempotencyKey: { type: 'string' },
        },
        required: ['capabilityId'],
        additionalProperties: false,
      },
    },
  },
];

export interface ChatRequest {
  userId: string;
  userTier: string;
  message: string;
  sessionId?: string | null;
}

export interface ChatResponse {
  response: string;
  sessionId: string;
  clientAction: CapabilityAction | null;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function enforceChatUsageLimit(userTier: string, usage: Awaited<ReturnType<typeof AiUsageService.getUsage>>) {
  const creditConfig = getCreditLimit(userTier, 'aiChat');

  if (creditConfig.limit > 0) {
    if (usage.questionCountToday >= creditConfig.limit) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You've reached your daily limit of ${creditConfig.limit} questions. Upgrade for more!`,
      });
    }
    return;
  }

  if (creditConfig.lifetimeLimit) {
    if (usage.questionCountLifetime >= creditConfig.lifetimeLimit) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You've used all ${creditConfig.lifetimeLimit} free trial questions. Upgrade to continue chatting with Woo!`,
      });
    }
    return;
  }

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'AI Chat is not available for your current tier.',
  });
}

async function ensureSession(userId: string, requestedSessionId: string | null | undefined, message: string) {
  if (!requestedSessionId) {
    const [newSession] = await db
      .insert(chatSessions)
      .values({
        userId,
        title: `${message.slice(0, 30)}...`,
      })
      .returning();

    return newSession.id;
  }

  const existingSession = await db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.id, requestedSessionId), eq(chatSessions.userId, userId)),
  });

  if (!existingSession) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Chat session not found.' });
  }

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, requestedSessionId));

  return requestedSessionId;
}

async function loadHistory(sessionId: string, shouldLoad: boolean) {
  if (!shouldLoad) {
    return [] as Array<{ role: string; content: string }>;
  }

  const rows = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: [asc(chatMessages.createdAt)],
    limit: CHAT_HISTORY_LIMIT,
  });

  return rows.map((row) => ({ role: row.role, content: row.content }));
}

async function buildFinancialContext(userId: string) {
  const holdings = await db.query.portfolioHoldings.findMany({
    where: eq(portfolioHoldings.userId, userId),
    with: { stock: true },
  });

  const top = holdings
    .slice(0, 3)
    .map((holding) => `${holding.stock.ticker} (${holding.quantity})`)
    .join(', ');

  return {
    positionCount: holdings.length,
    topHoldings: top || 'None',
    today: new Date().toISOString().split('T')[0],
  };
}

function buildSystemPrompt(context: Awaited<ReturnType<typeof buildFinancialContext>>) {
  return `You are Woo, a helpful financial assistant.

Use these tools only:
- get_capability_manifest
- execute_capability

Rules:
- Do not invent capability IDs.
- Use execute_capability whenever app data or actions are needed.
- For capabilities marked requiresConfirmation=true, ask for confirmation before execution if user intent is unclear.
- Keep answers concise and practical.

User financial context:
- Portfolio positions: ${context.positionCount}
- Top holdings: ${context.topHoldings}
- Today: ${context.today}`;
}

function canParallelizeToolCalls(toolCalls: ChatCompletionMessageToolCall[]) {
  return toolCalls.every((toolCall) => {
    if (toolCall.type !== 'function') return false;

    if (toolCall.function.name === 'get_capability_manifest') {
      return true;
    }

    if (toolCall.function.name !== 'execute_capability') {
      return false;
    }

    const args = parseJsonObject(toolCall.function.arguments);
    const capabilityId = readString(args.capabilityId);
    return Boolean(capabilityId && isCapabilityReadOnly(capabilityId));
  });
}

async function runToolCall(userId: string, toolCall: ChatCompletionMessageToolCall) {
  if (toolCall.type !== 'function') {
    return { toolCallId: toolCall.id, result: { error: { code: 'INVALID_TOOL', message: 'Unsupported tool call type.' } } };
  }

  if (toolCall.function.name === 'get_capability_manifest') {
    return {
      toolCallId: toolCall.id,
      result: getCapabilityManifest(),
      clientAction: null as CapabilityAction | null,
    };
  }

  if (toolCall.function.name !== 'execute_capability') {
    return {
      toolCallId: toolCall.id,
      result: {
        success: false,
        error: {
          code: 'UNKNOWN_TOOL',
          message: `Unknown tool: ${toolCall.function.name}`,
        },
      },
      clientAction: null as CapabilityAction | null,
    };
  }

  const args = parseJsonObject(toolCall.function.arguments);
  const capabilityId = readString(args.capabilityId);

  if (!capabilityId) {
    return {
      toolCallId: toolCall.id,
      result: {
        success: false,
        error: {
          code: 'INVALID_ARGS',
          message: 'execute_capability requires capabilityId.',
        },
      },
      clientAction: null as CapabilityAction | null,
    };
  }

  const executionResult = await executeCapability({
    userId,
    capabilityId,
    args: asRecord(args.args),
    dryRun: readBoolean(args.dryRun),
    confirmationToken: readString(args.confirmationToken) || null,
    idempotencyKey: readString(args.idempotencyKey) || null,
  });

  return {
    toolCallId: toolCall.id,
    result: executionResult,
    clientAction: executionResult.clientAction || null,
  };
}

export async function chatWithCapabilities(request: ChatRequest): Promise<ChatResponse> {
  const [usage, guard] = await Promise.all([
    AiUsageService.getUsage(request.userId),
    checkPromptGuard(request.message),
  ]);

  enforceChatUsageLimit(request.userTier, usage);

  if (!guard.isSafe) {
    return {
      response: 'Looks like you are trying to prompt inject, huh? 🤨',
      sessionId: request.sessionId || 'blocked',
      clientAction: null,
    };
  }

  const sessionId = await ensureSession(request.userId, request.sessionId, request.message);

  const [history, context] = await Promise.all([
    loadHistory(sessionId, Boolean(request.sessionId)),
    buildFinancialContext(request.userId),
  ]);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: buildSystemPrompt(context),
    },
    ...history.map((message) => ({
      role: message.role === 'model' ? 'assistant' : 'user',
      content: message.content,
    })) as ChatCompletionMessageParam[],
    {
      role: 'user',
      content: request.message,
    },
  ];

  await db.insert(chatMessages).values({
    sessionId,
    role: 'user',
    content: request.message,
  });

  let finalResponse = '';
  let clientAction: CapabilityAction | null = null;

  try {
    for (let turn = 0; turn < MAX_CHAT_TOOL_TURNS; turn += 1) {
      const completion = await createChatCompletionWithFallback(
        {
          model: MODEL_FLASH,
          messages,
          tools: chatTools,
          tool_choice: 'auto',
        },
        {
          purpose: 'chat',
          models: {
            openrouter: MODEL_FLASH,
            openai: process.env.OPENAI_CHAT_MODEL,
          },
        }
      );

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) {
        break;
      }

      messages.push(responseMessage);

      if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        finalResponse = responseMessage.content || '';
        break;
      }

      const toolCalls = responseMessage.tool_calls.filter((toolCall) => toolCall.type === 'function');
      const executeInParallel = canParallelizeToolCalls(toolCalls);

      const toolResults = executeInParallel
        ? await Promise.all(toolCalls.map((toolCall) => runToolCall(request.userId, toolCall)))
        : await toolCalls.reduce(async (promiseAcc, toolCall) => {
            const acc = await promiseAcc;
            const next = await runToolCall(request.userId, toolCall);
            acc.push(next);
            return acc;
          }, Promise.resolve([] as Awaited<ReturnType<typeof runToolCall>>[]));

      for (const toolResult of toolResults) {
        if (toolResult.clientAction) {
          clientAction = toolResult.clientAction;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolResult.toolCallId,
          content: JSON.stringify(toolResult.result),
        });
      }
    }

    const responseText = finalResponse || '(No response)';

    await Promise.all([
      db.insert(chatMessages).values({
        sessionId,
        role: 'model',
        content: responseText,
      }),
      AiUsageService.incrementUsage(request.userId),
    ]);

    return {
      response: responseText,
      sessionId,
      clientAction,
    };
  } catch (error: any) {
    console.error('AI Error:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error?.message || 'AI Service Error',
    });
  }
}

export async function getChatUsageStats(userId: string, userTier: string) {
  const usage = await AiUsageService.getUsage(userId);
  const creditConfig = getCreditLimit(userTier, 'aiChat');

  return {
    usageToday: usage.questionCountToday,
    usageLifetime: usage.questionCountLifetime,
    limit: creditConfig.limit,
    lifetimeLimit: creditConfig.lifetimeLimit,
    tierTitle: 'Woo',
    isLimited: userTier === 'pro',
    isFull: userTier === 'premium',
    remaining:
      creditConfig.limit > 0
        ? Math.max(0, creditConfig.limit - usage.questionCountToday)
        : creditConfig.lifetimeLimit
          ? Math.max(0, creditConfig.lifetimeLimit - usage.questionCountLifetime)
          : 0,
  };
}

export async function listChatSessions(userId: string) {
  return db.query.chatSessions.findMany({
    where: eq(chatSessions.userId, userId),
    orderBy: [desc(chatSessions.updatedAt)],
    limit: 20,
  });
}

export async function getChatSessionById(userId: string, sessionId: string) {
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)),
    with: {
      messages: {
        orderBy: [asc(chatMessages.createdAt)],
      },
    },
  });

  if (!session) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }

  return session;
}

export async function deleteChatSessionById(userId: string, sessionId: string) {
  await db
    .delete(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));

  return { success: true };
}
