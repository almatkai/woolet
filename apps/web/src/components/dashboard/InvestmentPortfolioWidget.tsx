import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Briefcase, ArrowRight, PieChart } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Link } from '@tanstack/react-router';
import { WidgetFooter } from './WidgetFooter';

type GridParams = { w: number; h: number; breakpoint?: string };

export function InvestmentPortfolioWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: portfolio, isLoading } = trpc.investing.getPortfolioSummary.useQuery();

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    if (isLoading) {
        return (
            <Card className="dashboard-widget h-full rounded-[32px] overflow-hidden">
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
    const unrealizedPL = portfolio?.unrealizedPL || 0;
    const unrealizedPLPercent = portfolio?.unrealizedPLPercent || 0;
    const holdings = portfolio?.holdings || [];
    const visibleHoldings = isTall ? holdings.slice(0, 4) : holdings.slice(0, 2);

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group rounded-[32px] overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <Link to="/investing" className="block flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-xl cursor-pointer">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Investment Portfolio</div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                                <CurrencyDisplay amount={totalValue} abbreviate={totalValue > 1000000} />
                            </span>
                            <div className={cn(
                                "flex items-center text-[10px] font-bold px-1 py-0 rounded-full",
                                unrealizedPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            )}>
                                {unrealizedPL >= 0 ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                                {Math.abs(unrealizedPLPercent).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    <div className="p-1.5 bg-blue-500/10 rounded-md group-hover:bg-blue-500/20 transition-colors">
                        <Briefcase className="h-4 w-4 text-blue-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {holdings.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-center py-4">
                                <p className="text-[10px] text-muted-foreground italic uppercase tracking-wider">No investments yet</p>
                            </div>
                        ) : (
                            visibleHoldings.map((holding: any) => (
                                <div key={holding.stockId} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors group/item">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <div className="h-6 w-6 rounded bg-background flex items-center justify-center text-[8px] font-bold text-blue-600 shadow-sm flex-shrink-0">
                                            {holding.ticker.slice(0, 3)}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-bold truncate leading-tight">{holding.ticker}</span>
                                            <span className="text-[8px] text-muted-foreground uppercase">{holding.quantity} Shares</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold">
                                            <CurrencyDisplay amount={Number(holding.currentValue)} abbreviate />
                                        </div>
                                        <div className={cn("text-[8px] font-medium", holding.unrealizedPL >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                            {holding.unrealizedPL >= 0 ? '+' : ''}{holding.unrealizedPLPercent.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Link>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <PieChart className="h-2.5 w-2.5" />
                    {holdings.length} Positions
                </span>
                <Link to="/investing" className="text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Analyze <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
