import React from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart as PieChartIcon } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTooltipPro } from '@/components/ui/tooltip-pro';

interface AssetAllocationWidgetProps {
    gridParams?: { w: number; h: number };
}

interface AllocationItem {
    name: string;
    value: number;
    percentage: number;
    color: string;
}

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

export function AssetAllocationWidget({ gridParams }: AssetAllocationWidgetProps) {
    const { data: portfolio, isLoading } = trpc.investing.getPortfolioSummary.useQuery();

    const isCompact = (gridParams?.h ?? 0) <= 1;
    const isMedium = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) === 2;
    const isLarge = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) >= 3;

    const holdings = portfolio?.holdings || [];
    const totalValue = portfolio?.currentValue || 0;

    // Calculate allocation by stock
    const allocationData: AllocationItem[] = holdings.map((holding: any, index: number) => ({
        name: holding.ticker,
        value: holding.currentValue || 0,
        percentage: totalValue > 0 ? ((holding.currentValue || 0) / totalValue) * 100 : 0,
        color: COLORS[index % COLORS.length],
    })).sort((a: any, b: any) => b.value - a.value);

    // Group by currency
    const byCurrency: Record<string, number> = {};
    holdings.forEach((holding: any) => {
        const currency = holding.currency || 'USD';
        byCurrency[currency] = (byCurrency[currency] || 0) + (holding.currentValue || 0);
    });

    const currencyData = Object.entries(byCurrency).map(([currency, value], index) => ({
        name: currency,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
        color: COLORS[index % COLORS.length],
    })).sort((a, b) => b.value - a.value);

    // Initialize tooltip hook for all views (will only be used in large view)
    const tooltip = useTooltipPro(allocationData, undefined, true);

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

    // Compact view
    if (isCompact) {
        const topHolding = allocationData[0];
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/investing" className="block">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate text-sm">Allocation</CardTitle>
                        <PieChartIcon className="dashboard-widget__icon" />
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-0">
                    {topHolding ? (
                        <>
                            <div className="dashboard-widget__value">{topHolding.percentage.toFixed(1)}%</div>
                            <p className="dashboard-widget__sub mt-0.5 truncate">
                                Top: {topHolding.name}
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="dashboard-widget__value">0%</div>
                            <p className="dashboard-widget__sub mt-0.5 truncate">No holdings</p>
                        </>
                    )}
                </CardContent>
            </Card>
        );
    }

    // Medium view - list with percentages
    if (isMedium && !isLarge) {
        return (
            <Card className="dashboard-widget h-full flex flex-col">
                <Link to="/investing" className="block">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 hover:bg-muted/50 transition-colors">
                        <div>
                            <CardTitle className="dashboard-widget__title truncate text-sm">Portfolio Holdings</CardTitle>
                            <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">
                                Stock distribution
                            </CardDescription>
                        </div>
                        <PieChartIcon className="dashboard-widget__icon" />
                    </CardHeader>
                </Link>
                <CardContent className="flex-1 overflow-hidden p-3 pt-0">
                    <ScrollArea className="h-full">
                        {allocationData.length === 0 ? (
                            <div className="text-center py-4 text-sm text-muted-foreground">
                                No holdings yet
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {allocationData.map((item: any) => (
                                    <div key={item.name} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: item.color }}
                                            />
                                            <span className="font-medium text-sm truncate">{item.name}</span>
                                        </div>
                                        <div className="text-right ml-2">
                                            <div className="font-semibold text-sm">{item.percentage.toFixed(1)}%</div>
                                            <div className="text-xs text-muted-foreground">
                                                <CurrencyDisplay amount={item.value} abbreviate />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
        );
    }

    // Large view - pie chart + detailed list
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <Link to="/investing" className="block">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 hover:bg-muted/50 transition-colors">
                    <div>
                        <CardTitle className="dashboard-widget__title truncate text-sm">Portfolio Holdings</CardTitle>
                        <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">
                            Stock distribution
                        </CardDescription>
                    </div>
                    <PieChartIcon className="dashboard-widget__icon" />
                </CardHeader>
            </Link>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0">
                {(() => {
                    if (allocationData.length === 0) {
                        return (
                            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                                No holdings yet
                            </div>
                        );
                    }

                    return (
                        <div className="h-full flex gap-4">
                            {/* Left: Pie Chart */}
                            <div className="flex-1 max-w-[50%] flex items-center justify-center">
                                <div
                                    className="relative w-full h-full max-w-full max-h-full"
                                    style={{ 
                                        width: 'min(100%, 100vh)', 
                                        height: 'min(100%, 100vh)',
                                        aspectRatio: '1'
                                    }}
                                    onMouseMove={tooltip.handleMouseMove}
                                    onMouseLeave={tooltip.handleMouseLeave}
                                >
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={allocationData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="35%"
                                                outerRadius="55%"
                                                paddingAngle={2}
                                                dataKey="value"
                                                onMouseEnter={(_, index) => tooltip.handleItemHover(allocationData[index])}
                                                onMouseLeave={() => tooltip.handleItemHover(null)}
                                                onClick={(_, index) => tooltip.handleItemClick(allocationData[index])}
                                            >
                                                {allocationData.map((entry: any, index: number) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.color}
                                                        stroke="rgba(255,255,255,0.2)"
                                                        strokeWidth={1}
                                                    />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {tooltip.renderTooltip()}
                                </div>
                            </div>

                            {/* Right: Stock List */}
                            <div className="flex-1 min-w-0">
                                <ScrollArea className="h-full">
                                    <div className="space-y-1.5">
                                        <div className="text-xs font-medium text-muted-foreground px-1 pb-1 border-b">
                                            By Stock
                                        </div>
                                        {allocationData.map((item: any) => (
                                            <div key={item.name} className="dashboard-widget__item flex items-center justify-between p-2">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: item.color }}
                                                    />
                                                    <span className="font-medium text-sm truncate">{item.name}</span>
                                                </div>
                                                <div className="text-right ml-2">
                                                    <div className="font-semibold text-sm">{item.percentage.toFixed(1)}%</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        <CurrencyDisplay amount={item.value} abbreviate />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {currencyData.length > 1 && (
                                            <>
                                                <div className="text-xs font-medium text-muted-foreground px-1 pt-2 pb-1 border-b">
                                                    By Currency
                                                </div>
                                                {currencyData.map((item: any) => (
                                                    <div key={item.name} className="dashboard-widget__item flex items-center justify-between p-2">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <div
                                                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                                style={{ backgroundColor: item.color }}
                                                            />
                                                            <span className="font-medium text-sm truncate">{item.name}</span>
                                                        </div>
                                                        <div className="text-right ml-2">
                                                            <div className="font-semibold text-sm">{item.percentage.toFixed(1)}%</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                <CurrencyDisplay amount={item.value} abbreviate />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    );
                })()}
            </CardContent>
        </Card>
    );
}
