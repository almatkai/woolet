import { initTRPC, TRPCError } from '@trpc/server';
import type { Context as HonoContext } from 'hono';
import { getAuth } from '@hono/clerk-auth';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { users, banks, accounts, currencyBalances } from '../db/schema';
import superjson from 'superjson';
import { GlitchTip } from './error-tracking';

export interface Context {
    db: typeof db;
    userId: string | null;
    honoContext: HonoContext;
    user?: {
        id: string;
        email?: string;
        name?: string;
        defaultCurrency?: string;
        subscriptionTier?: string;
        testMode?: boolean;
    };
}

import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export const createContext = async (opts: FetchCreateContextFnOptions, c: HonoContext): Promise<Record<string, unknown>> => {
    try {
        const auth = getAuth(c);
        return {
            db,
            userId: auth?.userId ?? null,
            honoContext: c,
        };
    } catch (err) {
        console.error('Error in createContext:', err);
        throw err;
    }
};

const t = initTRPC.context<Context>().create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
        // Report specific errors to GlitchTip
        if (error.code === 'INTERNAL_SERVER_ERROR') {
            GlitchTip.captureException(error);
        }
        return shape;
    },
});

export const router = t.router;
export const publicProcedure = t.procedure;

type ClerkClaims = Record<string, any>;

type ClerkAuthLike = {
    has?: (params: { plan?: string; feature?: string }) => boolean;
    sessionClaims?: ClerkClaims;
} | null | undefined;

function normalizeFeatureList(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (typeof raw === 'object') {
        return Object.entries(raw as Record<string, unknown>)
            .filter(([, value]) => Boolean(value))
            .map(([key]) => String(key));
    }
    return [];
}

function extractClerkFeatures(sessionClaims?: ClerkClaims): string[] {
    if (!sessionClaims) return [];
    const buckets = [
        sessionClaims.features,
        sessionClaims.publicMetadata?.features,
        sessionClaims.privateMetadata?.features,
        sessionClaims.unsafeMetadata?.features,
        sessionClaims.org?.publicMetadata?.features,
        sessionClaims.org?.privateMetadata?.features,
        sessionClaims.org?.unsafeMetadata?.features,
    ];
    return buckets.flatMap(normalizeFeatureList).map((f) => f.toLowerCase());
}

function extractPlanName(sessionClaims?: ClerkClaims): string | null {
    const name =
        sessionClaims?.subscription?.plan?.name ||
        sessionClaims?.subscription?.plan?.id ||
        sessionClaims?.subscription?.items?.[0]?.plan?.name ||
        sessionClaims?.subscription?.items?.[0]?.plan?.id ||
        sessionClaims?.plan?.name ||
        sessionClaims?.plan?.id ||
        sessionClaims?.billing?.plan?.name ||
        sessionClaims?.billing?.plan?.id ||
        null;

    return name ? String(name).toLowerCase() : null;
}

function extractTierOverride(sessionClaims?: ClerkClaims): string | null {
    const tier =
        sessionClaims?.subscriptionTier ||
        sessionClaims?.publicMetadata?.subscriptionTier ||
        sessionClaims?.privateMetadata?.subscriptionTier ||
        sessionClaims?.unsafeMetadata?.subscriptionTier ||
        sessionClaims?.org?.publicMetadata?.subscriptionTier ||
        sessionClaims?.org?.privateMetadata?.subscriptionTier ||
        sessionClaims?.org?.unsafeMetadata?.subscriptionTier ||
        null;

    return tier ? String(tier).toLowerCase() : null;
}

function resolveTierFromClaims(sessionClaims?: ClerkClaims): 'free' | 'pro' | 'premium' | null {
    const features = extractClerkFeatures(sessionClaims);

    if (features.includes('premium_market_insight_digest')) return 'premium';
    if (features.includes('market_insight_digest')) return 'pro';

    const tierOverride = extractTierOverride(sessionClaims);
    if (tierOverride === 'premium') return 'premium';
    if (tierOverride === 'pro') return 'pro';

    const planName = extractPlanName(sessionClaims);
    if (planName?.includes('premium')) return 'premium';
    if (planName?.includes('pro')) return 'pro';

    return null;
}

function resolveTierFromAuth(auth: ClerkAuthLike): 'free' | 'pro' | 'premium' | null {
    if (!auth?.has) return null;

    try {
        if (auth.has({ feature: 'premium_market_insight_digest' })) return 'premium';
        if (auth.has({ feature: 'market_insight_digest' })) return 'pro';

        if (auth.has({ plan: 'premium' })) return 'premium';
        if (auth.has({ plan: 'pro' })) return 'pro';
    } catch (error) {
        console.error('Failed to read Clerk entitlements:', error);
    }

    return null;
}

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.userId) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to access this resource',
        });
    }

    // Identify user in GlitchTip
    GlitchTip.setUser({ id: ctx.userId });

    // Auto-sync user: ensure user exists in database
    let user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
    });

    if (!user) {
        // Get Clerk user info from the auth context
        const auth = getAuth(ctx.honoContext);

        // Create user with available info (email from Clerk session claims)
        const sessionClaims = auth?.sessionClaims as { email?: string; name?: string } | undefined;
        const email = sessionClaims?.email || `${ctx.userId}@placeholder.local`;
        const name = sessionClaims?.name;

        try {
            const [newUser] = await ctx.db.insert(users).values({
                id: ctx.userId,
                email: email,
                name: name,
                defaultCurrency: 'USD',
            }).returning();
            user = newUser;
            console.log(`✅ Auto-created user: ${ctx.userId}`);
        } catch (err) {
            // User might have been created by a concurrent request
            console.log(`User ${ctx.userId} already exists or creation failed:`, err);
            // Fetch again
            user = await ctx.db.query.users.findFirst({
                where: eq(users.id, ctx.userId),
            });
        }
    }

    if (!user) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to find or create user',
        });
    }

    const auth = getAuth(ctx.honoContext) as ClerkAuthLike;
    const sessionClaims = auth?.sessionClaims as ClerkClaims | undefined;
    const derivedTier = resolveTierFromAuth(auth) || resolveTierFromClaims(sessionClaims);

    if (!derivedTier) {
        console.log('[TRPC] Raw Claims:', JSON.stringify(sessionClaims, null, 2));
    }

    if (derivedTier && user.subscriptionTier !== derivedTier) {
        try {
            const [updatedUser] = await ctx.db
                .update(users)
                .set({ subscriptionTier: derivedTier, updatedAt: new Date() })
                .where(eq(users.id, ctx.userId))
                .returning();
            if (updatedUser) user = updatedUser;
        } catch (error) {
            console.error('Failed to sync subscription tier:', error);
        }
    }

    // Ensure default Cash bank/account exists for current mode
    try {
        let cashBank = await ctx.db.query.banks.findFirst({
            where: and(
                eq(banks.userId, ctx.userId),
                eq(banks.isTest, user.testMode),
                eq(banks.name, 'Cash')
            ),
            with: {
                accounts: {
                    with: {
                        currencyBalances: true,
                    },
                },
            },
        });

        if (!cashBank) {
            const [newBank] = await ctx.db.insert(banks).values({
                userId: ctx.userId,
                name: 'Cash',
                icon: '💵',
                color: '#16a34a',
                isTest: user.testMode,
            }).returning();
            
            // Re-fetch or manually construct to satisfy the "with" relations for next steps
            cashBank = { ...newBank, accounts: [] };
        }

        const existingCashAccount = cashBank.accounts?.find((acc) => acc.type === 'cash');
        let cashAccountId = existingCashAccount?.id;

        if (!cashAccountId) {
            const [newAccount] = await ctx.db.insert(accounts).values({
                bankId: cashBank.id,
                name: 'Cash',
                type: 'cash',
                icon: '💵',
            }).returning();
            cashAccountId = newAccount?.id;
            // Also update our local copy if we were to use it later in this function
            (cashBank.accounts as any[]).push({ ...newAccount, currencyBalances: [] });
        }

        if (cashAccountId) {
            const defaultCurrency = (user.defaultCurrency || 'USD').toUpperCase();
            const currentAccount = cashBank.accounts?.find(acc => acc.id === cashAccountId);
            const hasDefaultBalance = currentAccount?.currencyBalances?.some(
                (cb) => cb.currencyCode === defaultCurrency
            );

            if (!hasDefaultBalance) {
                await ctx.db.insert(currencyBalances).values({
                    accountId: cashAccountId,
                    currencyCode: defaultCurrency,
                    balance: '0',
                });
            }
        }
    } catch (err) {
        console.error('Failed to ensure Cash account:', err);
    }

    return next({
        ctx: {
            ...ctx,
            userId: ctx.userId,
            user,
        },
    });
});

