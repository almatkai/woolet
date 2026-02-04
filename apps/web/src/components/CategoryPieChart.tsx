import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAmountAbbreviated } from '@/components/CurrencyDisplay';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useTooltipPro } from '@/components/ui/tooltip-pro';

const COLORS = ['#a78bfa', '#f87171', '#facc15', '#4ade80', '#60a5fa', '#f472b6', '#22d3ee', '#fb923c'];

function useElementSize<T extends HTMLElement>() {
    const [element, setElement] = useState<T | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    const ref = useCallback((node: T | null) => {
        setElement(node);
    }, []);

    useEffect(() => {
        if (!element) return;

        const update = () => {
            const rect = element.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);

    return { ref, size };
}

export function CategoryPieChart({ gridParams }: { gridParams?: { w: number; h: number } }) {
    const [period, setPeriod] = useState<'weekly' | 'monthly'>('monthly');
    const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set());
    const [initialized, setInitialized] = useState(false);
    const chartArea = useElementSize<HTMLDivElement>();

    const gridW = gridParams?.w ?? 0;
    const showSelector = gridW === 1;

    const { data: balanceData } = trpc.account.getTotalBalance.useQuery();



    // Calculate dates
    const dateRange = useMemo(() => {
        const now = new Date();
        if (period === 'weekly') {
            return {
                start: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
                end: endOfWeek(now, { weekStartsOn: 1 }).toISOString()
            };
        } else {
            return {
                start: startOfMonth(now).toISOString(),
                end: endOfMonth(now).toISOString()
            };
        }
    }, [period]);

    const { data: stats, isLoading } = trpc.transaction.getSpendingStats.useQuery({
        startDate: dateRange.start,
        endDate: dateRange.end,
    });

    // Initialize enabled categories when data loads
    useEffect(() => {
        if (stats?.categoryData && !initialized) {
            setEnabledCategories(new Set(stats.categoryData.map((c: any) => c.id)));
            setInitialized(true);
        }
    }, [stats, initialized]);

    const chartSize = useMemo(() => {
        // User requirement: chart's diagonal should fit within the available box.
        // A square with side `s` has diagonal `s * sqrt(2)`.
        // So if the available min dimension is `minDim`, we want `s = minDim / sqrt(2)`.
        const minDim = Math.min(chartArea.size.width, chartArea.size.height);
        if (!Number.isFinite(minDim) || minDim <= 0) return 0;
        const sideFromDiagonal = minDim / Math.SQRT2;
        const padding = 8;
        return Math.max(60, Math.floor(sideFromDiagonal - padding));
    }, [chartArea.size.height, chartArea.size.width]);

    const strokeWidth = 3;
    const { outerRadius, innerRadius } = useMemo(() => {
        if (chartSize <= 0) return { outerRadius: 0, innerRadius: 0 };
        const outer = Math.max(12, Math.floor(chartSize / 2 - strokeWidth - 2));
        const inner = Math.max(10, Math.floor(outer * 0.68));
        return { outerRadius: outer, innerRadius: inner };
    }, [chartSize, strokeWidth]);

    const currencyCode = useMemo(() => {
        if (!balanceData?.balances) return 'KZT';
        const activeBalances = Object.entries(balanceData.balances)
            .filter(([_, amount]) => amount !== 0);
        return activeBalances.length > 0 ? activeBalances[0][0] : 'KZT';
    }, [balanceData]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const handleToggleCategory = (id: string) => {
        setEnabledCategories(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };


    // Filter data based on enabled categories
    const filteredData = useMemo(() => {
        return (stats?.categoryData || []).filter((c: any) => enabledCategories.has(c.id));
    }, [stats, enabledCategories]);

    const filteredTotal = useMemo(() => {
        return filteredData.reduce((sum: number, c: any) => sum + c.value, 0);
    }, [filteredData]);

    // Initialize tooltip hook
    const tooltip = useTooltipPro(filteredData, (value: number) => formatCurrency(value), true);



    if (isLoading) {
        return (
            <Card className="dashboard-widget h-full flex flex-col overflow-hidden">
                <CardHeader className="pb-2 px-4 pt-4">
                    <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent className="flex-1 p-4 flex items-center justify-center">
                    <Skeleton className="h-[200px] w-[200px] rounded-full" />
                </CardContent>
            </Card>
        );
    }

    const allCategories = stats?.categoryData || [];

    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <CardHeader className="pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
                <div className="flex items-center justify-between gap-2">
                    <Link to="/spending" className="min-w-0 flex-1">
                        <CardTitle className="text-sm font-semibold hover:underline">Category Spending</CardTitle>
                    </Link>
                    <Tabs value={period} onValueChange={(v) => setPeriod(v as 'weekly' | 'monthly')}>
                        <TabsList className="h-7 bg-muted/50 p-0.5">
                            <TabsTrigger value="weekly" className="h-full px-2 text-[10px]">W</TabsTrigger>
                            <TabsTrigger value="monthly" className="h-full px-2 text-[10px]">M</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-2 sm:p-4 pt-0 sm:pt-2 overflow-hidden flex flex-col">
                {showSelector ? (
                    <>
                        {/* Category Selector */}
                        <div className="mb-3">
                            <Select
                                value="all"
                                onValueChange={(value) => {
                                    if (value === 'all') {
                                        setEnabledCategories(new Set(allCategories.map((c: any) => c.id)));
                                    } else if (value === 'none') {
                                        setEnabledCategories(new Set());
                                    } else {
                                        handleToggleCategory(value);
                                    }
                                }}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={`${enabledCategories.size} categories selected`} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        <div className="flex items-center gap-2">
                                            <Checkbox checked={enabledCategories.size === allCategories.length} className="pointer-events-none" />
                                            <span>Select All</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="none">
                                        <div className="flex items-center gap-2">
                                            <Checkbox checked={false} className="pointer-events-none" />
                                            <span>Deselect All</span>
                                        </div>
                                    </SelectItem>
                                    {allCategories.map((entry: any, index: number) => (
                                        <SelectItem key={entry.id} value={entry.id}>
                                            <div className="flex items-center gap-2 w-full">
                                                <Checkbox
                                                    checked={enabledCategories.has(entry.id)}
                                                    className="pointer-events-none"
                                                />
                                                <div
                                                    className="h-2 w-2 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: entry.color || COLORS[index % COLORS.length] }}
                                                />
                                                <span className="flex-1">{entry.name}</span>
                                                <span className="text-muted-foreground text-xs">{formatAmountAbbreviated(entry.value)}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div
                            ref={chartArea.ref}
                            className="flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-hidden"
                        >
                            {chartSize <= 0 ? (
                                <Skeleton className="h-24 w-24 rounded-full" />
                            ) : (
                            <div
                                className="relative"
                                style={{ width: chartSize, height: chartSize }}
                                onMouseMove={tooltip.handleMouseMove}
                                onMouseLeave={tooltip.handleMouseLeave}
                            >
                                <PieChart width={chartSize} height={chartSize} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Pie
                                        data={filteredData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={innerRadius}
                                        outerRadius={outerRadius}
                                        paddingAngle={2}
                                        dataKey="value"
                                        strokeWidth={strokeWidth}
                                        onClick={(_, index) => tooltip.handleItemClick(filteredData[index])}
                                        onMouseEnter={(_, index) => tooltip.handleItemHover(filteredData[index])}
                                        onMouseLeave={() => tooltip.handleItemHover(null)}
                                    >
                                        {filteredData.map((entry: any, index: number) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.color || COLORS[index % COLORS.length]}
                                                stroke={entry.color || COLORS[index % COLORS.length]}
                                                fillOpacity={1}
                                            />
                                        ))}
                                    </Pie>
                                </PieChart>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span
                                        className="font-bold tracking-tight text-foreground"
                                        style={{ fontSize: Math.max(chartSize * 0.12, 10) }}
                                    >
                                        {formatAmountAbbreviated(filteredTotal)}
                                    </span>
                                    <span
                                        className="text-muted-foreground uppercase font-medium tracking-widest leading-none mt-1"
                                        style={{ fontSize: Math.max(chartSize * 0.05, 7) }}
                                    >
                                        {enabledCategories.size} Categories
                                    </span>
                                    <span
                                        className="text-muted-foreground font-medium mt-0.5"
                                        style={{ fontSize: Math.max(chartSize * 0.05, 8) }}
                                    >
                                        {formatCurrency(filteredTotal)}
                                    </span>
                                </div>

                                {tooltip.renderTooltip()}
                            </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 min-h-0 flex gap-2 sm:gap-6">
                        {/* Left: Pie Chart centered vertically */}
                        <div
                            ref={chartArea.ref}
                            className="flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-hidden"
                        >
                            {chartSize <= 0 ? (
                                <Skeleton className="h-24 w-24 rounded-full" />
                            ) : (
                            <div
                                className="relative"
                                style={{ width: chartSize, height: chartSize }}
                                onMouseMove={tooltip.handleMouseMove}
                                onMouseLeave={tooltip.handleMouseLeave}
                            >
                                <PieChart width={chartSize} height={chartSize} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Pie
                                        data={filteredData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={innerRadius}
                                        outerRadius={outerRadius}
                                        paddingAngle={2}
                                        dataKey="value"
                                        strokeWidth={strokeWidth}
                                        onClick={(_, index) => tooltip.handleItemClick(filteredData[index])}
                                        onMouseEnter={(_, index) => tooltip.handleItemHover(filteredData[index])}
                                        onMouseLeave={() => tooltip.handleItemHover(null)}
                                    >
                                        {filteredData.map((entry: any, index: number) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.color || COLORS[index % COLORS.length]}
                                                stroke={entry.color || COLORS[index % COLORS.length]}
                                                fillOpacity={1}
                                            />
                                        ))}
                                    </Pie>
                                </PieChart>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span
                                        className="font-bold tracking-tight text-foreground"
                                        style={{ fontSize: Math.max(chartSize * 0.12, 10) }}
                                    >
                                        {formatAmountAbbreviated(filteredTotal)}
                                    </span>
                                    <span
                                        className="text-muted-foreground uppercase font-medium tracking-widest leading-none mt-1"
                                        style={{ fontSize: Math.max(chartSize * 0.05, 7) }}
                                    >
                                        {enabledCategories.size} Categories
                                    </span>
                                    <span
                                        className="text-muted-foreground font-medium mt-0.5"
                                        style={{ fontSize: Math.max(chartSize * 0.05, 8) }}
                                    >
                                        {formatCurrency(filteredTotal)}
                                    </span>
                                </div>

                                {tooltip.renderTooltip()}
                            </div>
                            )}
                        </div>

                        {/* Right: Category list with checkboxes */}
                        <div className="w-32 lg:w-44 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-auto space-y-1">
                                {allCategories.map((entry: any, index: number) => {
                                    const isEnabled = enabledCategories.has(entry.id);
                                    const percentage = stats?.total ? (entry.value / stats.total * 100) : 0;
                                    return (
                                        <div
                                            key={entry.id}
                                            className="flex items-center gap-1.5 sm:gap-2 cursor-pointer min-w-0"
                                            onClick={() => handleToggleCategory(entry.id)}
                                        >
                                            <Checkbox
                                                checked={isEnabled}
                                                onCheckedChange={() => handleToggleCategory(entry.id)}
                                                className="pointer-events-none flex-shrink-0"
                                            />
                                            <div
                                                className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full flex-shrink-0"
                                                style={{
                                                    backgroundColor: entry.color || COLORS[index % COLORS.length],
                                                    opacity: isEnabled ? 1 : 0.3
                                                }}
                                            />
                                            <span className={`text-xs sm:text-sm flex-1 truncate min-w-0 ${isEnabled ? '' : 'text-muted-foreground'}`}>
                                                {entry.name}
                                            </span>
                                            <div className="text-right flex-shrink-0">
                                                <div className={`text-xs sm:text-sm font-semibold ${isEnabled ? '' : 'text-muted-foreground'}`}>
                                                    {formatAmountAbbreviated(entry.value)}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    {percentage.toFixed(0)}%
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {allCategories.length === 0 && (
                                    <div className="text-sm text-muted-foreground text-center py-4">
                                        No spending data
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
