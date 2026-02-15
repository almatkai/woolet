import React from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Legend } from 'recharts';
import { TooltipPro } from '@/components/ui/tooltip-pro';

interface InvestmentPerformanceWidgetProps {
    gridParams?: { w: number; h: number };
}

export function InvestmentPerformanceWidget({ gridParams }: InvestmentPerformanceWidgetProps) {
    const { data: portfolio, isLoading: portfolioLoading } = trpc.investing.getPortfolioSummary.useQuery();
    const { data: chartData, isLoading: chartLoading } = trpc.investing.getPortfolioChart.useQuery(
        { range: '1M' },
        { enabled: (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) >= 3 }
    );

    const isCompact = (gridParams?.h ?? 0) <= 1;
    const isMedium = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) === 2;
    const isLarge = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) >= 3;

    const isLoading = portfolioLoading || (isLarge && chartLoading);

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-8 w-full" />
                </CardContent>
            </Card>
        );
    }

    const totalValue = portfolio?.currentValue || 0;
    const totalCost = portfolio?.totalInvested || 0;
    const totalPL = portfolio?.unrealizedPL || 0;
    const totalROI = portfolio?.totalReturnPercent || 0;
    const realizedPL = portfolio?.realizedPL || 0;

    // Compact view
    if (isCompact) {
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/investing" className="block">
                    <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate">Performance</CardTitle>
                        <div className={cn('dashboard-widget__header-value', totalROI >= 0 ? 'text-green-600' : 'text-red-600')}>
                            {totalROI >= 0 ? '+' : ''}{totalROI.toFixed(2)}%
                        </div>
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-1 pb-2 flex-1 flex items-end">
                    <p className="dashboard-widget__sub w-full truncate">
                        ROI • <CurrencyDisplay amount={totalPL} showSign abbreviate />
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Medium view - stats grid
    if (isMedium && !isLarge) {
        return (
            <Card className="dashboard-widget h-full flex flex-col">
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <div>
                        <CardTitle className="dashboard-widget__title truncate">Performance</CardTitle>
                        <CardDescription className="dashboard-widget__desc truncate">
                            Returns & P/L
                        </CardDescription>
                    </div>
                    <BarChart3 className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-3 pt-0">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <p className="dashboard-widget__meta">Total ROI</p>
                            <div className={cn('dashboard-widget__value', 
                                totalROI >= 0 ? 'text-green-600' : 'text-red-600'
                            )}>
                                {totalROI >= 0 ? '+' : ''}{totalROI.toFixed(2)}%
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="dashboard-widget__meta">Unrealized P/L</p>
                            <div className={cn('dashboard-widget__value', 
                                totalPL >= 0 ? 'text-green-600' : 'text-red-600'
                            )}>
                                <CurrencyDisplay amount={totalPL} showSign abbreviate />
                            </div>
                        </div>
                        <div className="col-span-2 space-y-1">
                            <p className="dashboard-widget__meta">Realized P/L</p>
                            <div className={cn('dashboard-widget__value', 
                                realizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                            )}>
                                <CurrencyDisplay amount={realizedPL} showSign abbreviate />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Large view - chart and detailed stats
    const formattedChartData = chartData?.map((item: any) => ({
        date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: item.value,
        cost: item.cost,
    })) || [];

    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <Link to="/investing" className="block">
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                    <div>
                        <CardTitle className="dashboard-widget__title truncate">Portfolio Performance</CardTitle>
                        <CardDescription className="dashboard-widget__desc truncate">
                            Value vs Cost Basis
                        </CardDescription>
                    </div>
                    <BarChart3 className="dashboard-widget__icon" />
                </CardHeader>
            </Link>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col gap-2">
                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-0.5">
                        <p className="dashboard-widget__meta">ROI</p>
                        <div className={cn('font-medium text-sm', 
                            totalROI >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                            {totalROI >= 0 ? '+' : ''}{totalROI.toFixed(2)}%
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <p className="dashboard-widget__meta">Unrealized</p>
                        <div className={cn('font-medium text-sm', 
                            totalPL >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                            <CurrencyDisplay amount={totalPL} showSign abbreviate />
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <p className="dashboard-widget__meta">Realized</p>
                        <div className={cn('font-medium text-sm', 
                            realizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                            <CurrencyDisplay amount={realizedPL} showSign abbreviate />
                        </div>
                    </div>
                </div>

                {/* Chart */}
                {formattedChartData.length > 0 && (
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={formattedChartData}>
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    axisLine={false}
                                />

                                <Legend
                                    wrapperStyle={{ fontSize: '11px' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="value"
                                    name="Portfolio Value"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="cost"
                                    name="Cost Basis"
                                    stroke="hsl(var(--muted-foreground))"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {formattedChartData.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                        No data yet
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
