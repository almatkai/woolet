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
}

import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export const createContext = async (opts: FetchCreateContextFnOptions, c: HonoContext): Promise<Context> => {
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

