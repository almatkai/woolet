import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { users, banks, accounts, debts, deposits, mortgages, transactions, subscriptions } from '../db/schema';

// Test mode limits
export const TEST_MODE_LIMITS = {
    transactions: 35,
    mortgages: 1,
    deposits: 2,
    debts: 4,
    accounts: 2,
    subscriptions: 10,
};

// Production limits (effectively unlimited)
export const PRODUCTION_LIMITS = {
    transactions: 999999,
    mortgages: 999999,
    deposits: 999999,
    debts: 999999,
    accounts: 999999,
    subscriptions: 999999,
};

export type EntityType = 'transactions' | 'mortgages' | 'deposits' | 'debts' | 'accounts' | 'subscriptions';

export async function checkEntityLimit(
    db: any,
    userId: string,
    entityType: EntityType
): Promise<void> {
    // Get user to check test mode
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });

    if (!user?.testMode) {
        return; // No limits in production mode
    }

    const limit = TEST_MODE_LIMITS[entityType];
    let currentCount = 0;

    switch (entityType) {
        case 'accounts': {
            const userBanks = await db.query.banks.findMany({
                where: eq(banks.userId, userId),
                with: { accounts: true }
            });
            currentCount = userBanks.reduce((sum: number, b: any) => sum + b.accounts.length, 0);
            break;
        }
        case 'debts': {
            const userDebts = await db.query.debts.findMany({
                where: eq(debts.lifecycleStatus, 'active'),
            });
            // Filter by user ownership through currencyBalance -> account -> bank
            currentCount = userDebts.length;
            break;
        }
        case 'deposits': {
            const userBanks = await db.query.banks.findMany({
                where: eq(banks.userId, userId),
                with: { accounts: true }
            });
            const accountIds = userBanks.flatMap((b: any) => b.accounts.map((a: any) => a.id));
            const allDeposits = await db.select().from(deposits);
            currentCount = allDeposits.filter((d: any) => accountIds.includes(d.accountId)).length;
            break;
        }
        case 'mortgages': {
            const userBanks = await db.query.banks.findMany({
                where: eq(banks.userId, userId),
                with: { accounts: true }
            });
            const accountIds = userBanks.flatMap((b: any) => b.accounts.map((a: any) => a.id));
            const allMortgages = await db.select().from(mortgages);
            currentCount = allMortgages.filter((m: any) => accountIds.includes(m.accountId)).length;
            break;
        }
        case 'transactions': {
            // Count all transactions for user's currency balances
            const userBanks = await db.query.banks.findMany({
                where: eq(banks.userId, userId),
                with: {
                    accounts: {
                        with: {
                            currencyBalances: true
                        }
                    }
                }
            });
            const currencyBalanceIds = userBanks.flatMap((b: any) =>
                b.accounts.flatMap((a: any) =>
                    a.currencyBalances.map((cb: any) => cb.id)
                )
            );
            const allTransactions = await db.select().from(transactions);
            currentCount = allTransactions.filter((t: any) =>
                currencyBalanceIds.includes(t.currencyBalanceId)
            ).length;
            break;
        }
        case 'subscriptions': {
            const allSubscriptions = await db.query.subscriptions.findMany({
                where: eq(subscriptions.userId, userId)
            });
            currentCount = allSubscriptions.length;
            break;
        }
    }

    if (currentCount >= limit) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Test Mode limit reached: You can only have ${limit} ${entityType}. Disable Test Mode in Settings to remove limits.`
        });
    }
}
