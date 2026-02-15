import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
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

export function MonthlyIncomeWidget({ gridParams }: { gridParams?: GridParams }) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthStr = startOfMonth.toISOString();

    const { data: incomeData, isLoading } = trpc.transaction.list.useQuery({
        type: 'income',
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

    const transactions = incomeData?.transactions || [];
    const transactionCount = transactions.length;
    const totalIncome = transactions.reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);
    const averageIncome = transactionCount > 0 ? totalIncome / transactionCount : 0;
    
    // Sort by date descending (newest first)
    const sortedTransactions = [...transactions].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Chart data
    const chartData = transactions
        .map(t => ({ date: t.date, amount: Number(t.amount) }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const canShowChart = isWide && chartData.length > 0 && (!isSmallBp || (gridParams?.h ?? 0) >= 3);

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <Skeleton className="h-4 w-28" />
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
                        <CardTitle className="dashboard-widget__title truncate">Monthly Income</CardTitle>
                        <div className="dashboard-widget__header-value text-green-600">
                            {totalIncome > 0 ? (
                                <CurrencyDisplay amount={totalIncome} showSign abbreviate />
                            ) : (
                                <CurrencyDisplay amount={0} abbreviate />
                            )}
                        </div>
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-1 pb-2 flex-1 flex flex-col">
                    <p className="dashboard-widget__meta truncate">
                        {transactionCount > 0 ? (
                            <>
                                Avg <CurrencyDisplay amount={averageIncome} abbreviate />
                            </>
                        ) : (
                            'No transactions yet'
                        )}
                    </p>
                    <p className="dashboard-widget__sub w-full truncate mt-auto">
                        {transactionCount} transactions
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
                    <CardTitle className="dashboard-widget__title truncate">Monthly Income</CardTitle>
                    <TrendingUp className="dashboard-widget__icon text-green-500" />
                </CardHeader>
            </Link>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col">
                <div className="dashboard-widget__value" style={{ color: totalIncome > 0 ? '#22c55e' : '#6b7280' }}>
                    {totalIncome > 0 ? (
                        <CurrencyDisplay amount={totalIncome} showSign abbreviate />
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
                                    <linearGradient id="grad-income" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />

                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#22c55e"
                                    fillOpacity={1}
                                    fill="url(#grad-income)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
                
                {/* Show transactions list if tall but not showing chart */}
                {isTall && sortedTransactions.length > 0 && (
                    <ScrollArea className="flex-1 -mx-1 px-1 mt-2">
                        <div className="space-y-1.5">
                            {sortedTransactions.slice(0, 5).map(tx => (
                                <div 
                                    key={tx.id} 
                                    className="dashboard-widget__item flex items-center justify-between p-1.5 rounded bg-muted/30"
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-sm flex-shrink-0">{tx.category?.icon || '💰'}</span>
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-xs font-medium line-clamp-2 break-words">
                                                {tx.description || tx.category?.name || 'Income'}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium text-green-600 whitespace-nowrap ml-2">
                                        <CurrencyDisplay 
                                            amount={Number(tx.amount)} 
                                            currency={tx.currencyBalance?.currencyCode}
                                            showSign
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
