import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, ArrowUpRight, DollarSign, Calendar } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Area, AreaChart, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { Link } from '@tanstack/react-router';
import { startOfMonth, subMonths, endOfMonth, format } from 'date-fns';
import { WidgetFooter } from './WidgetFooter';

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
    const now = new Date();
    const currentStart = startOfMonth(now);
    const prevStart = startOfMonth(subMonths(now, 1));
    const prevEnd = endOfMonth(prevStart);

    const { data: incomeData, isLoading: isCurrentLoading } = trpc.transaction.list.useQuery({
        type: 'income',
        startDate: currentStart.toISOString(),
        excludeFromStats: false,
        limit: 100
    }) as { data: { transactions: Transaction[], total: number } | undefined, isLoading: boolean };

    const { data: prevIncomeData, isLoading: isPrevLoading } = trpc.transaction.list.useQuery({
        type: 'income',
        startDate: prevStart.toISOString(),
        endDate: prevEnd.toISOString(),
        excludeFromStats: false,
        limit: 100
    }) as { data: { transactions: Transaction[], total: number } | undefined, isLoading: boolean };

    const isLoading = isCurrentLoading || isPrevLoading;

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrowCard = (gridParams?.w ?? 0) <= 1;
    const isShortCard = (gridParams?.h ?? 0) <= 2;

    const isCompact = isShortCard || isNarrowCard;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);
    const isWide = (gridParams?.w ?? 0) >= 2;

    const transactions = incomeData?.transactions || [];
    const totalIncome = transactions.reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);
    
    const prevTransactions = prevIncomeData?.transactions || [];
    const prevTotalIncome = prevTransactions.reduce((sum: number, t: Transaction) => sum + Number(t.amount), 0);
    
    const diff = totalIncome - prevTotalIncome;
    const percentChange = prevTotalIncome > 0 ? (diff / prevTotalIncome) * 100 : 0;

    // Chart data - grouped by day to make it cleaner
    const chartData = React.useMemo(() => {
        const grouped: Record<string, number> = {};
        transactions.forEach(t => {
            const day = t.date.split('T')[0];
            grouped[day] = (grouped[day] || 0) + Number(t.amount);
        });
        
        // Fill in missing days to have a proper sparkline
        const result = [];
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = format(new Date(now.getFullYear(), now.getMonth(), d), 'yyyy-MM-dd');
            result.push({
                date: dateStr,
                amount: grouped[dateStr] || 0
            });
            if (d === now.getDate()) break; // Only show up to today
        }
        return result;
    }, [transactions, now]);

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full rounded-[32px] overflow-hidden', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="p-3 pb-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-28 mt-1" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group overflow-hidden rounded-[32px]', isCompact && 'dashboard-widget--compact')}>
            <Link to="/spending" className="block flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-xl cursor-pointer">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Monthly Income</div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-lg sm:text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-500 whitespace-nowrap">
                                <CurrencyDisplay amount={totalIncome} showSign abbreviate={totalIncome > 1000000} />
                            </span>
                            <div className={cn(
                                "flex items-center text-[10px] font-bold px-1 py-0 rounded-full",
                                diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            )}>
                                {diff >= 0 ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                                {Math.abs(percentChange).toFixed(0)}%
                            </div>
                        </div>
                    </div>
                    <div className="p-1.5 bg-emerald-500/10 rounded-md group-hover:bg-emerald-500/20 transition-colors">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0 relative">
                    {/* Sparkline background */}
                    <div className="absolute inset-x-0 bottom-0 h-12 opacity-50 group-hover:opacity-80 transition-opacity pointer-events-none">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#10b981"
                                    strokeWidth={1.5}
                                    fill="rgba(16, 185, 129, 0.1)"
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="relative z-10 py-1">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="text-muted-foreground">Prev: <CurrencyDisplay amount={prevTotalIncome} abbreviate /></span>
                            <span className={cn("font-bold", diff >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                {diff >= 0 ? '+' : ''}<CurrencyDisplay amount={diff} abbreviate />
                            </span>
                        </div>
                        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-emerald-500 rounded-full" 
                                style={{ width: `${Math.min(100, (totalIncome / (prevTotalIncome || totalIncome || 1)) * 100)}%` }} 
                            />
                        </div>
                    </div>

                    {isTall && transactions.length > 0 && (
                        <div className="mt-2 space-y-1 overflow-hidden relative z-10">
                            {transactions.slice(0, 2).map(tx => (
                                <div key={tx.id} className="flex items-center justify-between p-1.5 rounded-md bg-background/60 backdrop-blur-sm border border-emerald-500/10">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-sm">{tx.category?.icon || '💰'}</span>
                                        <span className="text-[10px] font-bold truncate leading-tight">{tx.description || tx.category?.name || 'Income'}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-emerald-600 ml-1">
                                        <CurrencyDisplay amount={Number(tx.amount)} abbreviate />
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Link>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    {transactions.length}
                </span>
                <Link to="/spending" className="text-[9px] font-bold text-emerald-600 hover:underline uppercase tracking-wider">
                    Details
                </Link>
            </WidgetFooter>
        </Card>
    );
}
