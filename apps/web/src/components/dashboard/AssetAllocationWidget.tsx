import React from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart as PieChartIcon } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoronoiTreemap } from '@/components/charts/VoronoiTreemap';

interface AssetAllocationWidgetProps {
    gridParams?: { w: number; h: number };
}

interface AllocationItem {
    name: string;
    fullName?: string;
    value: number;
    formattedValue?: string;
    percentage: number;
    color: string;
}

const COLORS = ['#e56b9a', '#e86f51', '#e49500', '#be9e00', '#8aaa2a', '#3eb370', '#19b3a8', '#1da4c6', '#3994dc'];
const ROW_GLASS_CLASS = 'rounded-md border border-white/5 bg-background/30 backdrop-blur-md';

export function AssetAllocationWidget({ gridParams }: AssetAllocationWidgetProps) {
    const { data: portfolio, isLoading } = trpc.investing.getPortfolioSummary.useQuery();

    const width = gridParams?.w ?? 0;
    const height = gridParams?.h ?? 0;
    const isCompact = (gridParams?.h ?? 0) <= 1;
    const isNarrow = width <= 1 && height >= 2;
    const isMedium = width >= 2 && height === 2;
    const isLarge = width >= 2 && height >= 3;

    const holdings = portfolio?.holdings || [];
    const totalValue = portfolio?.currentValue || 0;

    // Calculate allocation by stock
    const allocationData: AllocationItem[] = holdings.map((holding: any, index: number) => ({
        name: holding.ticker,
        fullName: holding.name || holding.ticker,
        value: holding.currentValue || 0,
        formattedValue: new Intl.NumberFormat('en-US', { style: 'currency', currency: holding.currency || 'USD', maximumFractionDigits: 0 }).format(holding.currentValue || 0),
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

    // Compact view
    if (isCompact) {
        const topHolding = allocationData[0];
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/investing" className="block">
                    <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate">Portfolio</CardTitle>
                        <div className="dashboard-widget__header-value">
                            {topHolding ? `${topHolding.percentage.toFixed(1)}%` : '0%'}
                        </div>
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-1 pb-2 flex-1 flex items-end">
                    <p className="dashboard-widget__sub w-full truncate">
                        {topHolding ? `Top: ${topHolding.name}` : 'No holdings'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Narrow view - 1 column width, full diagram only
    if (isNarrow && !isLarge) {
        return (
            <Card className="dashboard-widget h-full flex flex-col">
                <Link to="/investing" className="block">
                    <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate">Portfolio</CardTitle>
                        <PieChartIcon className="dashboard-widget__icon" />
                    </CardHeader>
                </Link>
                <CardContent className="flex-1 overflow-hidden px-2 pt-1 pb-2">
                    {allocationData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                            No holdings yet
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <VoronoiTreemap
                                data={allocationData}
                                resolution={200}
                                cornerRadius={8}
                                showLabels
                                showPercentage
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    // Medium view - diagram left, stock list right
    if (isMedium && !isLarge) {
        return (
            <Card className="dashboard-widget h-full flex flex-col">
                <CardContent className="flex-1 overflow-hidden p-2 flex gap-3">
                    {allocationData.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                            No holdings yet
                        </div>
                    ) : (
                        <>
                            {/* Left: Full-size Voronoi Diagram */}
                            <div className="h-full flex items-center justify-center" style={{ flex: '0 0 45%' }}>
                                <VoronoiTreemap
                                    data={allocationData}
                                    resolution={250}
                                    cornerRadius={8}
                                    showLabels
                                    showPercentage
                                />
                            </div>

                            {/* Right: Header + Stock List */}
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <Link to="/investing" className="block">
                                    <div className="flex items-center justify-between hover:bg-muted/50 transition-colors rounded-md px-1 py-0.5">
                                        <div>
                                            <div className="font-medium text-base leading-tight">Portfolio</div>
                                            <div className="text-xs text-muted-foreground">Stock distribution</div>
                                        </div>
                                        <PieChartIcon className="dashboard-widget__icon" />
                                    </div>
                                </Link>
                                <ScrollArea className="flex-1">
                                    <div className="space-y-1">
                                        {allocationData.map((item: any) => (
                                            <div key={item.name} className={cn('flex items-center justify-between px-2 py-1', ROW_GLASS_CLASS)}>
                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                    <div
                                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: item.color }}
                                                    />
                                                    <span className="font-medium text-[12px] leading-4 truncate">{item.name}</span>
                                                </div>
                                                <div className="text-right ml-2">
                                                    <div className="font-medium text-xs">{item.percentage.toFixed(1)}%</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        <CurrencyDisplay amount={item.value} abbreviate />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        );
    }

    // Large view - voronoi tiles + detailed list
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <Link to="/investing" className="block">
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                    <div>
                        <CardTitle className="dashboard-widget__title truncate">Portfolio</CardTitle>
                        <CardDescription className="dashboard-widget__desc truncate">
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
                            {/* Left: Voronoi Tiles */}
                            <div className="flex-1 max-w-[50%] flex items-center justify-center">
                                <div className="relative w-full aspect-square" style={{ maxHeight: '100%' }}>
                                    <VoronoiTreemap
                                        data={allocationData}
                                        resolution={300}
                                        cornerRadius={10}
                                        showLabels
                                        showPercentage
                                    />
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
                                            <div key={item.name} className={cn('dashboard-widget__item flex items-center justify-between p-2', ROW_GLASS_CLASS)}>
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: item.color }}
                                                    />
                                                    <span className="font-medium text-sm leading-tight truncate">{item.name}</span>
                                                </div>
                                                <div className="text-right ml-2 flex-shrink-0">
                                                    <div className="font-medium text-sm leading-tight">{item.percentage.toFixed(1)}%</div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
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
                                                    <div key={item.name} className={cn('dashboard-widget__item flex items-center justify-between p-2', ROW_GLASS_CLASS)}>
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <div
                                                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                                style={{ backgroundColor: item.color }}
                                                            />
                                                            <span className="font-medium text-sm truncate">{item.name}</span>
                                                        </div>
                                                        <div className="text-right ml-2">
                                                            <div className="font-medium text-sm">{item.percentage.toFixed(1)}%</div>
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
