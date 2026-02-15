import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Area, AreaChart, ResponsiveContainer, XAxis } from 'recharts';
import { Link } from '@tanstack/react-router';

interface Transaction {
    id: string;
    amount: string | number;
    description?: string | null;
    date: string;
    type: string;
    parentTransactionId?: string | null;
    category?: {
        name: string;
        icon: string;
        type: string;
    } | null;
    currencyBalance?: {
        currencyCode: string;
    };
}

type GridParams = { w: number; h: number; breakpoint?: string };

export function MonthlyExpensesWidget({ gridParams }: { gridParams?: GridParams }) {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfMonthStr = startOfMonth.toISOString();

    const { data: expenseData, isLoading } = trpc.transaction.list.useQuery({
        type: 'expense',
        startDate: startOfMonthStr,
        excludeFromStats: false,
        limit: 100
    }) as { data: { transactions: Transaction[], total: number } | undefined, isLoading: boolean };

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const compactHeightThreshold = isSmallBp ? 2 : 1;
    const tallHeightThreshold = isSmallBp ? 2 : 1;
    const isNarrowCard = (gridParams?.w ?? 0) <= 1 && (gridParams?.h ?? 0) <= 2;

    const isCompact = (gridParams?.h ?? 0) <= compactHeightThreshold || isNarrowCard;
    const isTall = (gridParams?.h ?? 0) > tallHeightThreshold;
    const isWide = (gridParams?.w ?? 0) >= 2;

    const transactions = expenseData?.transactions || [];
    const transactionCount = transactions.length;
    const totalExpense = transactions.reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);
    const averageExpense = transactionCount > 0 ? totalExpense / transactionCount : 0;
    
    // Sort by date descending (newest first)
    const sortedTransactions = [...transactions].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Chart data - group by date to show net per day
    const chartData = transactions
        .map(t => ({ date: t.date, amount: Number(t.amount) }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const canShowChart = isWide && chartData.length > 0 && (!isSmallBp || (gridParams?.h ?? 0) >= 3);

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-8 w-32" />
                </CardContent>
            </Card>
        );
    }

    // Compact view
    if (isCompact) {
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/spending" className="block">
                    <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate">Monthly Expenses</CardTitle>
                        <div className="dashboard-widget__header-value text-red-600">
                            {totalExpense > 0 ? (
                                <CurrencyDisplay amount={-totalExpense} abbreviate />
                            ) : (
                                <CurrencyDisplay amount={0} abbreviate />
                            )}
                        </div>
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-1 pb-2 flex-1 flex flex-col">
                    <div className="flex-1 space-y-1 overflow-hidden">
                        {sortedTransactions.slice(0, 2).map((tx) => (
                            <div
                                key={tx.id}
                                className="dashboard-widget__item flex items-center justify-between gap-2 rounded bg-muted/30 px-1.5 py-1"
                            >
                                <span className="truncate flex-1 text-sm font-medium">
                                    {tx.description || tx.category?.name || 'Expense'}
                                </span>
                                <span className="whitespace-nowrap text-red-600">
                                    <CurrencyDisplay amount={-Number(tx.amount)} currency={tx.currencyBalance?.currencyCode} abbreviate />
                                </span>
                            </div>
                        ))}
                        {transactionCount === 0 && (
                            <p className="dashboard-widget__meta truncate">No recent expenses</p>
                        )}
                    </div>
                    <p className="dashboard-widget__sub w-full truncate mt-auto">
                        {transactionCount > 0 ? (
                            <>
                                {transactionCount} transactions • Avg <CurrencyDisplay amount={-averageExpense} abbreviate />
                            </>
                        ) : (
                            '0 transactions'
                        )}
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Expanded view with chart or transaction list
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <Link to="/spending" className="block">
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                    <CardTitle className="dashboard-widget__title truncate">Monthly Expenses</CardTitle>
                    <TrendingDown className="dashboard-widget__icon text-red-500" />
                </CardHeader>
            </Link>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col">
                <div
                    className={cn('dashboard-widget__value truncate', !isWide && 'text-sm')}
                    style={{ color: totalExpense > 0 ? '#ef4444' : '#6b7280' }}
                >
                    {totalExpense > 0 ? (
                        <CurrencyDisplay amount={-totalExpense} abbreviate />
                    ) : (
                        <CurrencyDisplay amount={0} abbreviate />
                    )}
                </div>
                
                {/* Show chart if wide enough */}
                {canShowChart && (
                    <div className="flex-1 min-h-0 mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="grad-expense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />

                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#ef4444"
                                    fillOpacity={1}
                                    fill="url(#grad-expense)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
                
                {/* Show transactions list if tall */}
                {isTall && sortedTransactions.length > 0 && (
                    <ScrollArea className="flex-1 -mx-1 px-1 mt-2">
                        <div className="space-y-1.5">
                            {sortedTransactions.slice(0, 5).map(tx => (
                                <div 
                                    key={tx.id} 
                                    className="dashboard-widget__item flex items-center justify-between p-1.5 rounded bg-muted/30"
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-sm">{tx.category?.icon || '💸'}</span>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-medium truncate leading-tight">
                                                {tx.description || tx.category?.name || 'Expense'}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium text-red-600 whitespace-nowrap ml-2">
                                        <CurrencyDisplay 
                                            amount={-Number(tx.amount)} 
                                            currency={tx.currencyBalance?.currencyCode}
                                        />
                                    </span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
                
                <p className="dashboard-widget__sub mt-auto pt-1">
                    {transactionCount} transactions
                </p>
            </CardContent>
        </Card>
    );
}
