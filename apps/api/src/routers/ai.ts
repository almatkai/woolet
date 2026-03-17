import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { marketDigests } from '../db/schema';
import { checkPromptGuard, getAiStatus } from '../lib/ai';
import { getAiDigestLength } from '../lib/checkLimit';
import { protectedProcedure, router } from '../lib/trpc';
import { TIER_LIMITS } from './bank';
import { AiConfigService } from '../services/ai/ai-config-service';
import { anomalyService } from '../services/ai/anomaly-service';
import {
  executeCapability as executeCapabilityAction,
  getCapabilityManifest as getCapabilityManifestAction,
} from '../services/ai/capability-registry';
import {
  chatWithCapabilities,
  deleteChatSessionById,
  getChatSessionById,
  getChatUsageStats,
  listChatSessions,
} from '../services/ai/chat-service';
import { digestService } from '../services/ai/digest-service';

const executeCapabilityInputSchema = z.object({
  capabilityId: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  dryRun: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

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
          ),
        });
        digest = entry?.content;
        if (digest) {
          await digestService.cacheDigestForDate(ctx.userId!, targetDate, digest);
        }
      }

      const followUps = await db.query.marketDigests.findMany({
        where: and(
          eq(marketDigests.userId, ctx.userId!),
          eq(marketDigests.digestDate, targetDate),
          eq(marketDigests.kind, 'custom')
        ),
        orderBy: [asc(marketDigests.createdAt)],
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

  getAvailableDigestDates: protectedProcedure.query(async ({ ctx }) => {
    const entries = await db.query.marketDigests.findMany({
      where: and(eq(marketDigests.userId, ctx.userId!), eq(marketDigests.kind, 'daily')),
      columns: { digestDate: true },
    });

    return entries.map((entry) => entry.digestDate);
  }),

  getDigestHistory: protectedProcedure.query(async ({ ctx }) => {
    const userTier = ctx.user.subscriptionTier || 'free';
    const limits = TIER_LIMITS[userTier as keyof typeof TIER_LIMITS];

    if (!limits.hasAiMarketDigest) {
      return [];
    }

    return db.query.marketDigests.findMany({
      where: and(eq(marketDigests.userId, ctx.userId!), eq(marketDigests.kind, 'daily')),
      orderBy: [desc(marketDigests.digestDate)],
      limit: 10,
      columns: {
        digestDate: true,
        content: true,
      },
    });
  }),

  regenerateDigest: protectedProcedure
    .input(
      z.object({
        specs: z.string().min(5).max(500),
        date: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userTier = ctx.user.subscriptionTier || 'free';
      if (userTier !== 'premium') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Digest regeneration is a Premium feature. Upgrade to Premium to use it.',
        });
      }

      const guard = await checkPromptGuard(input.specs);
      if (!guard.isSafe) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Looks like you are trying to prompt inject, huh? 🤨',
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

  getSpendingAnomalies: protectedProcedure.query(async ({ ctx }) => {
    return anomalyService.detectSpendingAnomalies(ctx.userId!);
  }),

  getChatUsage: protectedProcedure.query(async ({ ctx }) => {
    return getChatUsageStats(ctx.userId!, ctx.user.subscriptionTier || 'free');
  }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    return listChatSessions(ctx.userId!);
  }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getChatSessionById(ctx.userId!, input.sessionId);
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return deleteChatSessionById(ctx.userId!, input.sessionId);
    }),

  getCapabilityManifest: protectedProcedure.query(async () => {
    return getCapabilityManifestAction();
  }),

  executeCapability: protectedProcedure
    .input(executeCapabilityInputSchema)
    .mutation(async ({ ctx, input }) => {
      return executeCapabilityAction({
        userId: ctx.userId!,
        capabilityId: input.capabilityId,
        args: input.args,
        dryRun: input.dryRun,
        confirmationToken: input.confirmationToken || null,
        idempotencyKey: input.idempotencyKey || null,
      });
    }),

  chat: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        sessionId: z.string().uuid().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return chatWithCapabilities({
        userId: ctx.userId!,
        userTier: ctx.user.subscriptionTier || 'free',
        message: input.message,
        sessionId: input.sessionId,
      });
    }),

  getAiConfig: protectedProcedure.query(async () => {
    return AiConfigService.getConfig();
  }),

  updateAiConfig: protectedProcedure
    .input(
      z.object({
        providerOrder: z.array(z.enum(['openrouter', 'openai', 'gemini', 'groq'])).optional(),
        defaultProvider: z.enum(['openrouter', 'openai', 'gemini', 'groq']).optional(),
        modelSettings: z
          .object({
            openrouter: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
            openai: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
            gemini: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
            groq: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
          })
          .optional(),
        fallbackEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return AiConfigService.updateConfig(input);
    }),

  resetAiConfig: protectedProcedure.mutation(async () => {
    return AiConfigService.resetToDefault();
  }),

  getAiStatus: protectedProcedure.query(async () => {
    return getAiStatus();
  }),
});
