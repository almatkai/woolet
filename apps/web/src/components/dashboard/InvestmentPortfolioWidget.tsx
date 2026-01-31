import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Briefcase } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InvestmentPortfolioWidgetProps {
    gridParams?: { w: number; h: number };
}

export function InvestmentPortfolioWidget({ gridParams }: InvestmentPortfolioWidgetProps) {
    const { data: portfolio, isLoading } = trpc.investing.getPortfolioSummary.useQuery();

    const isCompact = (gridParams?.h ?? 0) <= 1;
    const isMedium = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) === 2;
    const isLarge = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) >= 3;

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
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
    const unrealizedPL = portfolio?.unrealizedPL || 0;
    const unrealizedPLPercent = portfolio?.unrealizedPLPercent || 0;
    const holdings = portfolio?.holdings || [];

    // Compact view
    if (isCompact) {
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <CardTitle className="dashboard-widget__title truncate text-sm">Portfolio</CardTitle>
                    <Briefcase className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="p-2 pt-0">
                    <div className="dashboard-widget__value">
                        <CurrencyDisplay amount={totalValue} abbreviate />
                    </div>
                    <div className={cn('dashboard-widget__sub mt-0.5 truncate flex items-center gap-1', 
                        unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                        {unrealizedPL >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        <CurrencyDisplay amount={unrealizedPL} showSign abbreviate /> ({unrealizedPLPercent.toFixed(1)}%)
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Medium view - show summary stats
    if (isMedium && !isLarge) {
        return (
            <Card className="dashboard-widget h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                    <div>
                        <CardTitle className="dashboard-widget__title truncate text-sm">Investment Portfolio</CardTitle>
                        <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">
                            {holdings.length} positions
                        </CardDescription>
                    </div>
                    <Briefcase className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-3 pt-0">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <p className="dashboard-widget__meta">Total Value</p>
                            <div className="dashboard-widget__value text-base">
                                <CurrencyDisplay amount={totalValue} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="dashboard-widget__meta">Total Cost</p>
                            <div className="dashboard-widget__value text-base">
                                <CurrencyDisplay amount={totalCost} />
                            </div>
                        </div>
                        <div className="col-span-2 space-y-1">
                            <p className="dashboard-widget__meta flex items-center gap-1">
                                {unrealizedPL >= 0 ? (
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                ) : (
                                    <TrendingDown className="h-3 w-3 text-red-600" />
                                )}
                                Unrealized P/L
                            </p>
                            <div className={cn('dashboard-widget__value text-base', 
                                unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                            )}>
                                <CurrencyDisplay amount={unrealizedPL} showSign /> ({unrealizedPLPercent.toFixed(2)}%)
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Large view - detailed holdings list
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                <div>
                    <CardTitle className="dashboard-widget__title truncate text-sm">Investment Portfolio</CardTitle>
                    <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">
                        Your investment holdings
                    </CardDescription>
                </div>
                <Briefcase className="dashboard-widget__icon" />
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col gap-2">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2 pb-2 border-b">
                    <div className="space-y-0.5">
                        <p className="dashboard-widget__meta text-[10px]">Value</p>
                        <div className="font-semibold text-sm">
                            <CurrencyDisplay amount={totalValue} abbreviate />
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <p className="dashboard-widget__meta text-[10px]">Cost</p>
                        <div className="font-semibold text-sm">
                            <CurrencyDisplay amount={totalCost} abbreviate />
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <p className="dashboard-widget__meta text-[10px]">P/L</p>
                        <div className={cn('font-semibold text-sm', 
                            unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                            <CurrencyDisplay amount={unrealizedPL} showSign abbreviate />
                        </div>
                    </div>
                </div>

                {/* Holdings List */}
                <ScrollArea className="flex-1">
                    {holdings.length === 0 ? (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                            No investments yet
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {holdings.map((holding: any) => {
                                const currentValue = holding.currentValue || 0;
                                const costBasis = (holding.quantity || 0) * (holding.averageCostBasis || 0);
                                const pl = holding.unrealizedPL || 0;
                                const plPercent = holding.unrealizedPLPercent || 0;

                                return (
                                    <div key={holding.stockId} className="dashboard-widget__item rounded-md p-2">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate">{holding.ticker}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {holding.quantity} shares @ <CurrencyDisplay amount={holding.averageCostBasis} />
                                                </div>
                                            </div>
                                            <div className="text-right ml-2">
                                                <div className="font-semibold text-sm">
                                                    <CurrencyDisplay amount={currentValue} abbreviate />
                                                </div>
                                                <div className={cn('text-xs', pl >= 0 ? 'text-green-600' : 'text-red-600')}>
                                                    <CurrencyDisplay amount={pl} showSign abbreviate /> ({plPercent.toFixed(1)}%)
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
