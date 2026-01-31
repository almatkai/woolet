import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Area, AreaChart, ResponsiveContainer, XAxis } from 'recharts';
import { TooltipPro } from '@/components/ui/tooltip-pro';

interface Transaction {
    id: string;
    amount: string | number;
    description?: string | null;
    date: string;
    type: string;
    category?: {
        name: string;
        icon: string;
    } | null;
    currencyBalance?: {
        currencyCode: string;
    };
}

type GridParams = { w: number; h: number; breakpoint?: string };

export function MonthlyExpensesWidget({ gridParams }: { gridParams?: GridParams }) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
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

    const isCompact = (gridParams?.h ?? 0) <= compactHeightThreshold;
    const isTall = (gridParams?.h ?? 0) > tallHeightThreshold;
    const isWide = (gridParams?.w ?? 0) >= 2;

    const transactions = expenseData?.transactions || [];
    const transactionCount = expenseData?.total ?? transactions.length;
    const totalExpense = transactions.reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);
    
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <CardTitle className="dashboard-widget__title truncate text-sm">Monthly Expenses</CardTitle>
                    <TrendingDown className="dashboard-widget__icon text-red-500" />
                </CardHeader>
                <CardContent className="p-2 pt-0">
                    <div className="dashboard-widget__value" style={{ color: totalExpense > 0 ? '#ef4444' : '#6b7280' }}>
                        {totalExpense > 0 ? (
                            <CurrencyDisplay amount={-totalExpense} abbreviate />
                        ) : (
                            <CurrencyDisplay amount={0} abbreviate />
                        )}
                    </div>
                    <p className="dashboard-widget__sub mt-0.5 truncate">
                        {transactionCount} transactions
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Expanded view with chart or transaction list
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                <CardTitle className="dashboard-widget__title truncate text-sm">Monthly Expenses</CardTitle>
                <TrendingDown className="dashboard-widget__icon text-red-500" />
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col">
                <div className="dashboard-widget__value" style={{ color: totalExpense > 0 ? '#ef4444' : '#6b7280' }}>
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
                                            <span className="text-xs font-medium truncate">
                                                {tx.description || tx.category?.name || 'Expense'}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
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
