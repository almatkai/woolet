import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
// toast removed (unused)

const STORAGE_KEY = 'woolet :recent-transactions-widget';

interface Transaction {
    id: string;
    amount: string | number;
    description?: string | null;
    date: string;
    type: string;
    category?: {
        id: string;
        name: string;
        icon: string;
    } | null;
    currencyBalance?: {
        currencyCode: string;
        account?: {
            name: string;
        } | null;
    };
}

export function RecentTransactionsWidget({ gridParams }: { gridParams?: { w: number; h: number } }) {
    // State for filters and preferences
    const [excludedCategories, setExcludedCategories] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    return parsed.excludedCategories || [];
                } catch (e) {
                    console.error('Failed to parse saved preferences', e);
                }
            }
        }
        return [];
    });

    const [period, setPeriod] = useState<'week' | 'month' | 'all'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    return parsed.period || 'all';
                } catch (e) {
                    console.error('Failed to parse saved period', e);
                }
            }
        }
        return 'all';
    });

    // showIncomeOnly/showExpensesOnly removed (unused)

    // utils removed (unused)
    const { data: user } = trpc.user.me.useQuery();
    // categories removed (unused)


    // updateUser mutation removed (unused)

    // Sync LocalStorage
    useEffect(() => {
        const prefs = {
            excludedCategories,
            period,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }, [excludedCategories, period]);

    // Sync from Database
    useEffect(() => {
        const handle = setTimeout(() => {
            if (user?.preferences) {
                const prefs = user.preferences as any;
                const dbPrefs = prefs?.recentTransactionsWidget;
                if (dbPrefs) {
                    if (Array.isArray(dbPrefs.excludedCategories)) {
                        const currentStr = JSON.stringify(excludedCategories.slice().sort());
                        const dbStr = JSON.stringify(dbPrefs.excludedCategories.slice().sort());
                        if (currentStr !== dbStr) {
                            setExcludedCategories(dbPrefs.excludedCategories);
                        }
                    }
                    if (dbPrefs.period && dbPrefs.period !== period) {
                        setPeriod(dbPrefs.period);
                    }
                }
            }
        }, 0);
        return () => clearTimeout(handle);
    }, [user, excludedCategories, period]);

    // handleSavePreferences removed (unused)


    // Calculate date range
    const dateRange = useMemo(() => {
        const now = new Date();
        if (period === 'week') {
            return {
                start: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
                end: endOfWeek(now, { weekStartsOn: 1 }).toISOString()
            };
        } else if (period === 'month') {
            return {
                start: startOfMonth(now).toISOString(),
                end: endOfMonth(now).toISOString()
            };
        }
        return null; // All time
    }, [period]);

    const queryParams = useMemo(() => ({
        limit: 20,
        hideAdjustments: true,
        ...(dateRange && {
            startDate: dateRange.start,
            endDate: dateRange.end
        })
    }), [dateRange]);

    const { data: recentTransactions } = trpc.transaction.list.useQuery(queryParams) as { data: { transactions: Transaction[] } | undefined };

    // Filtering handled inline where needed (removed unused variable)


    // categoryOptions removed (unused)


    // Less restrictive compact mode - only for very small widgets
    const isCompact = (gridParams?.w ?? 0) <= 1 && (gridParams?.h ?? 0) <= 1;

    if (isCompact) {
        const transactions = recentTransactions?.transactions || [];
        const latestTransaction = transactions[0];

        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col">
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 flex-shrink-0">
                    <CardTitle className="dashboard-widget__title">Recent</CardTitle>
                    <div className="dashboard-widget__header-value">{transactions.length}</div>
                </CardHeader>
                <CardContent className="p-2 pt-1 pb-2 flex-1 flex items-end">
                    <p className="dashboard-widget__sub w-full truncate">
                        {latestTransaction
                            ? `${format(new Date(latestTransaction.date), 'MM/dd')} • ${latestTransaction.description || latestTransaction.category?.name || 'Transaction'}`
                            : 'No transactions'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col', isCompact && 'dashboard-widget--compact')}>
            <Link to="/spending" className="block">
                <CardHeader className="dashboard-widget__header p-2 pb-1 hover:bg-muted/50 transition-colors">
                    <CardTitle className="dashboard-widget__title truncate">Recent Transactions</CardTitle>
                </CardHeader>
            </Link>
            <CardContent className="flex-1 overflow-auto p-3 pt-0">
                <div className="space-y-1 sm:space-y-4">
                    {(recentTransactions?.transactions || []).length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[60px] text-center">
                            <p className="dashboard-widget__desc">No recent transactions</p>
                        </div>
                    ) : (
                        recentTransactions?.transactions.map((tx: Transaction) => {
                            const txAmount = tx.type === 'expense' ? -Math.abs(Number(tx.amount)) : Number(tx.amount);
                            const shouldAbbreviate = Math.abs(txAmount) > 999;
                            return (
                            <div key={tx.id} className="flex items-center justify-between py-1 px-1 sm:p-1.5 hover:bg-muted/50 rounded-lg transition-colors gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-muted/60 flex items-center justify-center dashboard-widget__item text-xs flex-shrink-0">
                                        {tx.category?.icon || '📄'}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="dashboard-widget__item font-medium truncate max-w-[95px] sm:max-w-[140px]">{tx.description || tx.category?.name || 'Unknown'}</p>
                                        <p className="dashboard-widget__meta">
                                            {new Date(tx.date).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <span className={`dashboard-widget__item font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-green-600' : tx.type === 'expense' ? 'text-red-600' : 'text-foreground'}`}>
                                    <CurrencyDisplay
                                        amount={txAmount}
                                        currency={tx.currencyBalance?.currencyCode || 'USD'}
                                        showSign={tx.type === 'income'}
                                        abbreviate={shouldAbbreviate}
                                    />
                                </span>
                            </div>
                        )})
                    )}
                </div>
                {(recentTransactions?.transactions || []).length > 0 && (
                    <div className="pt-2 sm:pt-4">
                        <Link to="/spending">
                            <Button variant="outline" className="dashboard-widget__button w-full h-7 sm:h-9">
                                View All
                            </Button>
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
