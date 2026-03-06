import type { QueryClient, QueryKey } from '@tanstack/react-query';

type QuerySnapshot = {
    queryKey: QueryKey;
    data: unknown;
};

export type BalanceDelta = {
    currencyBalanceId: string;
    currencyCode?: string;
    delta: number;
};

type TransactionLike = {
    id: string;
    amount?: string | number | null;
    cashbackAmount?: string | number | null;
    fee?: string | number | null;
    exchangeRate?: string | number | null;
    type?: string | null;
    date?: string | null;
    description?: string | null;
    currencyBalanceId?: string | null;
    toCurrencyBalanceId?: string | null;
    parentTransactionId?: string | null;
    excludeFromMonthlyStats?: boolean | null;
    lifecycleStatus?: string | null;
    childTransactions?: TransactionLike[] | null;
    category?: {
        id?: string;
        name?: string;
        icon?: string;
    } | null;
    currencyBalance?: {
        currencyCode?: string;
        account?: {
            id?: string;
            name?: string;
            bank?: {
                name?: string;
            } | null;
        } | null;
    } | null;
};

type TransactionListData = {
    transactions: TransactionLike[];
};

type TotalBalanceData = {
    accountCount: number;
    balances: Record<string, number>;
};

type BankHierarchy = Array<{
    accounts?: Array<{
        currencyBalances?: Array<{
            id: string;
            balance: string | number;
        }>;
    }>;
}>;

function getPath(queryKey: QueryKey): string[] {
    return Array.isArray(queryKey[0]) ? (queryKey[0] as string[]) : [];
}

function getInput(queryKey: QueryKey): Record<string, unknown> | undefined {
    const meta = queryKey[1];
    if (!meta || typeof meta !== 'object' || !('input' in meta)) {
        return undefined;
    }
    return (meta as { input?: Record<string, unknown> }).input;
}

function isPath(queryKey: QueryKey, ...parts: string[]) {
    const path = getPath(queryKey);
    return parts.every((part, index) => path[index] === part);
}

function normalizeDate(date?: string | null) {
    return date ? date.split('T')[0] : '';
}

function toNumber(value: string | number | null | undefined) {
    return typeof value === 'number' ? value : Number(value ?? 0);
}

function sortTransactions(transactions: TransactionLike[]) {
    return [...transactions].sort((a, b) => {
        const aDate = normalizeDate(a.date);
        const bDate = normalizeDate(b.date);
        if (aDate === bDate) {
            return a.id.localeCompare(b.id);
        }
        return bDate.localeCompare(aDate);
    });
}

function removeTransactionFromChildren(
    transactions: TransactionLike[],
    transactionId: string,
): TransactionLike[] {
    return transactions
        .filter((transaction) => transaction.id !== transactionId)
        .map((transaction) => ({
            ...transaction,
            childTransactions: transaction.childTransactions
                ? removeTransactionFromChildren(transaction.childTransactions, transactionId)
                : transaction.childTransactions,
        }));
}

function transactionMatchesFilter(
    transaction: TransactionLike,
    input?: Record<string, unknown>,
) {
    if (!transaction || transaction.lifecycleStatus === 'deleted') {
        return false;
    }

    if (!input) {
        return transaction.parentTransactionId == null;
    }

    if (input.type && transaction.type !== input.type) {
        return false;
    }

    if (input.currencyBalanceId && transaction.currencyBalanceId !== input.currencyBalanceId) {
        return false;
    }

    if (
        input.excludeFromStats !== undefined &&
        transaction.excludeFromMonthlyStats !== input.excludeFromStats
    ) {
        return false;
    }

    if (!input.includeChildren && transaction.parentTransactionId) {
        return false;
    }

    if (
        input.hideAdjustments &&
        transaction.description === 'Balance manual adjustment'
    ) {
        return false;
    }

    const txDate = normalizeDate(transaction.date);
    const startDate = typeof input.startDate === 'string' ? normalizeDate(input.startDate) : '';
    const endDate = typeof input.endDate === 'string' ? normalizeDate(input.endDate) : '';

    if (startDate && txDate < startDate) {
        return false;
    }

    if (endDate && txDate > endDate) {
        return false;
    }

    return true;
}

function upsertTransactionInList(
    current: TransactionLike[],
    nextTransaction: TransactionLike,
    input?: Record<string, unknown>,
) {
    const withoutCurrent = removeTransactionFromChildren(current, nextTransaction.id);
    const matches = transactionMatchesFilter(nextTransaction, input);

    if (nextTransaction.parentTransactionId) {
        const next = withoutCurrent.map((transaction) => {
            if (transaction.id !== nextTransaction.parentTransactionId) {
                return transaction;
            }

            const children = transaction.childTransactions ?? [];
            return {
                ...transaction,
                childTransactions: sortTransactions([...children, nextTransaction]),
            };
        });

        return matches ? next : withoutCurrent;
    }

    if (!matches) {
        return withoutCurrent;
    }

    return sortTransactions([nextTransaction, ...withoutCurrent]);
}

export function captureOptimisticFinanceSnapshot(queryClient: QueryClient): QuerySnapshot[] {
    return queryClient
        .getQueryCache()
        .findAll()
        .filter((query) => {
            const key = query.queryKey;
            return (
                isPath(key, 'transaction', 'list') ||
                isPath(key, 'account', 'getTotalBalance') ||
                isPath(key, 'bank', 'getHierarchy')
            );
        })
        .map((query) => ({
            queryKey: query.queryKey,
            data: query.state.data,
        }));
}

export function restoreOptimisticFinanceSnapshot(
    queryClient: QueryClient,
    snapshots: QuerySnapshot[] | undefined,
) {
    if (!snapshots) {
        return;
    }

    snapshots.forEach(({ queryKey, data }) => {
        queryClient.setQueryData(queryKey, data);
    });
}

export function applyBalanceDeltas(
    queryClient: QueryClient,
    deltas: BalanceDelta[],
) {
    if (!deltas.length) {
        return;
    }

    queryClient
        .getQueryCache()
        .findAll()
        .forEach((query) => {
            if (isPath(query.queryKey, 'account', 'getTotalBalance')) {
                queryClient.setQueryData(query.queryKey, (current: TotalBalanceData | undefined) => {
                    if (!current) {
                        return current;
                    }

                    const balances = { ...current.balances };
                    deltas.forEach(({ currencyCode, delta }) => {
                        if (!currencyCode) {
                            return;
                        }
                        balances[currencyCode] = (balances[currencyCode] ?? 0) + delta;
                    });

                    return {
                        ...current,
                        balances,
                    };
                });
            }

            if (isPath(query.queryKey, 'bank', 'getHierarchy')) {
                queryClient.setQueryData(query.queryKey, (current: BankHierarchy | undefined) => {
                    if (!current) {
                        return current;
                    }

                    return current.map((bank) => ({
                        ...bank,
                        accounts: bank.accounts?.map((account) => ({
                            ...account,
                            currencyBalances: account.currencyBalances?.map((balance) => {
                                const totalDelta = deltas
                                    .filter((delta) => delta.currencyBalanceId === balance.id)
                                    .reduce((sum, delta) => sum + delta.delta, 0);

                                if (!totalDelta) {
                                    return balance;
                                }

                                return {
                                    ...balance,
                                    balance: toNumber(balance.balance) + totalDelta,
                                };
                            }),
                        })),
                    }));
                });
            }
        });
}

export function upsertTransactionAcrossCaches(
    queryClient: QueryClient,
    nextTransaction: TransactionLike,
) {
    queryClient
        .getQueryCache()
        .findAll()
        .forEach((query) => {
            if (!isPath(query.queryKey, 'transaction', 'list')) {
                return;
            }

            const input = getInput(query.queryKey);
            queryClient.setQueryData(query.queryKey, (current: TransactionListData | undefined) => {
                if (!current?.transactions) {
                    return current;
                }

                return {
                    ...current,
                    transactions: upsertTransactionInList(current.transactions, nextTransaction, input),
                };
            });
        });
}

export function removeTransactionAcrossCaches(
    queryClient: QueryClient,
    transactionId: string,
) {
    queryClient
        .getQueryCache()
        .findAll()
        .forEach((query) => {
            if (!isPath(query.queryKey, 'transaction', 'list')) {
                return;
            }

            queryClient.setQueryData(query.queryKey, (current: TransactionListData | undefined) => {
                if (!current?.transactions) {
                    return current;
                }

                return {
                    ...current,
                    transactions: removeTransactionFromChildren(current.transactions, transactionId),
                };
            });
        });
}

export function buildBalanceDeltasForTransaction(
    transaction: Pick<
        TransactionLike,
        'type' | 'amount' | 'cashbackAmount' | 'fee' | 'exchangeRate' | 'currencyBalanceId' | 'toCurrencyBalanceId'
    >,
    currencyCodeByBalanceId: Map<string, string>,
    direction: 1 | -1,
): BalanceDelta[] {
    const amount = toNumber(transaction.amount);
    const cashback = toNumber(transaction.cashbackAmount);
    const fee = toNumber(transaction.fee);
    const rate = toNumber(transaction.exchangeRate) || 1;
    const deltas: BalanceDelta[] = [];

    if (transaction.type === 'income' && transaction.currencyBalanceId) {
        deltas.push({
            currencyBalanceId: transaction.currencyBalanceId,
            currencyCode: currencyCodeByBalanceId.get(transaction.currencyBalanceId),
            delta: amount * direction,
        });
    }

    if (transaction.type === 'expense' && transaction.currencyBalanceId) {
        deltas.push({
            currencyBalanceId: transaction.currencyBalanceId,
            currencyCode: currencyCodeByBalanceId.get(transaction.currencyBalanceId),
            delta: (-amount + cashback) * direction,
        });
    }

    if (transaction.type === 'transfer' && transaction.currencyBalanceId) {
        deltas.push({
            currencyBalanceId: transaction.currencyBalanceId,
            currencyCode: currencyCodeByBalanceId.get(transaction.currencyBalanceId),
            delta: (-amount - fee) * direction,
        });
    }

    if (transaction.type === 'transfer' && transaction.toCurrencyBalanceId) {
        deltas.push({
            currencyBalanceId: transaction.toCurrencyBalanceId,
            currencyCode: currencyCodeByBalanceId.get(transaction.toCurrencyBalanceId),
            delta: amount * rate * direction,
        });
    }

    return deltas;
}
