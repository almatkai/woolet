import React from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TrendingUp, BarChart3, ArrowRight, LineChart as LineChartIcon } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { WidgetFooter } from './WidgetFooter';

type GridParams = { w: number; h: number; breakpoint?: string };

export function InvestmentPerformanceWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: portfolio, isLoading: portfolioLoading } = trpc.investing.getPortfolioSummary.useQuery();
    const { data: chartData, isLoading: chartLoading } = trpc.investing.getPortfolioChart.useQuery(
        { range: '1M' }
    );

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    const isLoading = portfolioLoading || chartLoading;

    if (isLoading) {
        return (
            <Card className="dashboard-widget h-full overflow-hidden">
                <CardHeader className="p-3 pb-2">
                    <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-8 w-32 mb-4" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        );
    }

    const totalValue = portfolio?.currentValue || 0;
    const totalROI = portfolio?.totalReturnPercent || 0;
    const totalPL = portfolio?.unrealizedPL || 0;

    const formattedChartData = chartData?.map((item: any) => ({
        date: item.date,
        value: item.value,
    })) || [];

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Portfolio Growth</div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                                {totalROI >= 0 ? '+' : ''}{totalROI.toFixed(2)}%
                            </span>
                            <div className={cn(
                                "flex items-center text-[10px] font-bold px-1 py-0 rounded-full",
                                totalPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            )}>
                                <CurrencyDisplay amount={totalPL} showSign abbreviate />
                            </div>
                        </div>
                    </div>
                    <div className="p-1.5 bg-indigo-500/10 rounded-md group-hover:bg-indigo-500/20 transition-colors">
                        <BarChart3 className="h-4 w-4 text-indigo-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0 relative">
                    {/* Sparkline background */}
                    <div className="absolute inset-x-0 bottom-0 h-16 opacity-50 group-hover:opacity-80 transition-opacity pointer-events-none">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={formattedChartData}>
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={1.5}
                                    fill="hsl(var(--primary) / 0.1)"
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {!isCompact && (
                        <div className="relative z-10 grid grid-cols-2 gap-2 mt-2">
                            <div className="p-2 rounded-md bg-background/60 backdrop-blur-sm border border-border/50">
                                <span className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Current Value</span>
                                <span className="text-[10px] font-bold truncate">
                                    <CurrencyDisplay amount={totalValue} abbreviate />
                                </span>
                            </div>
                            <div className="p-2 rounded-md bg-background/60 backdrop-blur-sm border border-border/50">
                                <span className="text-[8px] text-muted-foreground uppercase font-bold block mb-0.5">Realized P/L</span>
                                <span className={cn("text-[10px] font-bold truncate", (portfolio?.realizedPL || 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                    <CurrencyDisplay amount={portfolio?.realizedPL || 0} showSign abbreviate />
                                </span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </div>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <LineChartIcon className="h-2.5 w-2.5" />
                    Last 30 Days
                </span>
                <Link to="/investing" className="dashboard-widget__footer-action text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Returns <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
