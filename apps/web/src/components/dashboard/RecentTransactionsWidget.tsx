import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { History, ArrowRight, List } from 'lucide-react';
import { WidgetFooter } from './WidgetFooter';

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

    const { data: user } = trpc.user.me.useQuery();

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        const currentPrefs = saved ? JSON.parse(saved) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...currentPrefs, period }));
    }, [period]);

    useEffect(() => {
        if (user?.preferences) {
            const prefs = user.preferences as any;
            const dbPeriod = prefs?.recentTransactionsWidget?.period;
            if (dbPeriod && dbPeriod !== period) {
                setPeriod(dbPeriod);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

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
        return null;
    }, [period]);

    const queryParams = useMemo(() => ({
        limit: 10,
        hideAdjustments: true,
        ...(dateRange && {
            startDate: dateRange.start,
            endDate: dateRange.end
        })
    }), [dateRange]);

    const { data: recentTransactions, isLoading } = trpc.transaction.list.useQuery(queryParams) as { data: { transactions: Transaction[] } | undefined, isLoading: boolean };

    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;

    const transactions = recentTransactions?.transactions || [];
    const visibleTransactions = isShort ? transactions.slice(0, 3) : transactions.slice(0, 6);

    if (isLoading) {
        return (
            <Card className="dashboard-widget h-full overflow-hidden">
                <CardHeader className="p-3 pb-2">
                    <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Recent Activity</div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                                {transactions.length} 
                                <span className="text-[10px] text-muted-foreground font-medium ml-1">transactions</span>
                            </span>
                        </div>
                    </div>
                    <div className="p-1.5 bg-muted rounded-md group-hover:bg-muted/80 transition-colors">
                        <History className="h-4 w-4 text-muted-foreground" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1 overflow-hidden py-1">
                        {visibleTransactions.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-center py-4">
                                <p className="text-[10px] text-muted-foreground italic uppercase tracking-wider">No recent activity</p>
                            </div>
                        ) : (
                            visibleTransactions.map((tx) => {
                                const txAmount = tx.type === 'expense' ? -Math.abs(Number(tx.amount)) : Number(tx.amount);
                                return (
                                    <div key={tx.id} className="flex items-center justify-between gap-3 p-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors group/item">
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div className="h-7 w-7 rounded-full bg-background shadow-sm flex items-center justify-center text-xs flex-shrink-0">
                                                {tx.category?.icon || '📄'}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[11px] font-semibold truncate leading-tight">{tx.description || tx.category?.name || 'Unknown'}</span>
                                                <span className="text-[9px] text-muted-foreground truncate uppercase">{format(new Date(tx.date), 'MMM d, yyyy')}</span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className={cn(
                                                "text-[11px] font-bold",
                                                tx.type === 'income' ? 'text-emerald-600' : tx.type === 'expense' ? 'text-rose-600' : ''
                                            )}>
                                                <CurrencyDisplay
                                                    amount={txAmount}
                                                    currency={tx.currencyBalance?.currencyCode || 'USD'}
                                                    showSign={tx.type === 'income'}
                                                    abbreviate={Math.abs(txAmount) > 9999}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </CardContent>
            </div>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                    {period === 'all' ? 'All Time' : period === 'week' ? 'This Week' : 'This Month'}
                </span>
                <Link to="/spending" className="dashboard-widget__footer-action text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    View All <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
