import { useMemo, useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button'; // Added Button
import { Save, ArrowUpRight, ArrowDownRight, TrendingDown, TrendingUp } from 'lucide-react'; // Added Save and Trash icons
import { toast } from 'sonner'; // Added toast
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAmountAbbreviated } from '@/components/CurrencyDisplay';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, subWeeks, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';

// Local type definitions for user preferences
interface UserPreferences {
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    spendingWidget?: {
        categoryIds?: string[];
    };
    recentTransactionsWidget?: {
        excludedCategories?: string[];
        period?: string;
    };
}

type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const DEFAULT_WEEK_STARTS_ON: WeekStartDay = 1; // Monday

const STORAGE_KEY = 'woolet :spending-widget-categories';

export function SpendingChart({ gridParams }: { gridParams?: { w: number; h: number } }) {
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isCompact = isNarrow || (gridParams?.h ?? 0) <= 2;
    const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');

    // Initialize with LocalStorage value if available
    const [categoryIds, setCategoryIds] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.error('Failed to parse saved categories', e);
                }
            }
        }
        return [];
    });

    const utils = trpc.useUtils();
    const { data: user } = trpc.user.me.useQuery();
    const updateUser = trpc.user.update.useMutation({
        onSuccess: () => {
            toast.success('Widget preferences saved');
            utils.user.me.invalidate();
        },
        onError: () => {
            toast.error('Failed to save preferences');
        }
    });

    // Sync LocalStorage when state changes
    useEffect(() => {
        if (categoryIds.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(categoryIds));
        } else {
            // Optional: Don't clear if you want to keep last selection, but "no selection" is a valid state too
            // somewhat. But user wants to "only show results for those selected".
            // If empty, we show prompts.
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [categoryIds]);

    // Sync from Database when user data loads
    useEffect(() => {
        const handle = setTimeout(() => {
            if (user?.preferences) {
                const prefs = user.preferences as any;
                const dbCategories = prefs?.spendingWidget?.categoryIds;
                if (Array.isArray(dbCategories) && dbCategories.length > 0) {
                    const currentStr = JSON.stringify(categoryIds.slice().sort());
                    const dbStr = JSON.stringify(dbCategories.slice().sort());

                    if (currentStr !== dbStr) {
                        setCategoryIds(dbCategories);
                    }
                }
            }
        }, 0);
        return () => clearTimeout(handle);
    }, [user, categoryIds]);

    const handleSavePreferences = () => {
        const currentPrefs = (user?.preferences as any) || {};
        updateUser.mutate({
            preferences: {
                ...currentPrefs,
                spendingWidget: {
                    ...currentPrefs.spendingWidget,
                    categoryIds: categoryIds,
                }
            }
        });
    };

    // Calculate dates based on period
    const dateRange = useMemo(() => {
        const now = new Date();
        const userPrefs = (user?.preferences as UserPreferences) || {};
        let weekStartsOn = userPrefs.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;

        // Ensure weekStartsOn is a proper number and within valid range
        if (typeof weekStartsOn === 'string') {
            weekStartsOn = parseInt(weekStartsOn, 10) as WeekStartDay;
        }
        weekStartsOn = Math.max(0, Math.min(6, Number(weekStartsOn))) as WeekStartDay;

        if (period === 'weekly') {
            const dateStartsOn = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
            const start = startOfWeek(now, { weekStartsOn: dateStartsOn });
            const end = endOfWeek(now, { weekStartsOn: dateStartsOn });

            const prevStart = subWeeks(start, 1);
            const prevEnd = subWeeks(end, 1);

            // Use format to get local date string (YYYY-MM-DD) to avoid timezone issues
            // Then append time to create a proper ISO string in local context
            const startDateStr = format(start, 'yyyy-MM-dd');
            const endDateStr = format(end, 'yyyy-MM-dd');
            const prevStartDateStr = format(prevStart, 'yyyy-MM-dd');
            const prevEndDateStr = format(prevEnd, 'yyyy-MM-dd');

            return {
                start: `${startDateStr}T00:00:00.000Z`,
                end: `${endDateStr}T23:59:59.999Z`,
                prevStart: `${prevStartDateStr}T00:00:00.000Z`,
                prevEnd: `${prevEndDateStr}T23:59:59.999Z`
            };
        } else {
            const start = startOfMonth(now);
            const end = endOfMonth(now);
            const prevStart = subMonths(start, 1);
            const prevEnd = subMonths(end, 1);

            const startDateStr = format(start, 'yyyy-MM-dd');
            const endDateStr = format(end, 'yyyy-MM-dd');
            const prevStartDateStr = format(prevStart, 'yyyy-MM-dd');
            const prevEndDateStr = format(prevEnd, 'yyyy-MM-dd');

            return {
                start: `${startDateStr}T00:00:00.000Z`,
                end: `${endDateStr}T23:59:59.999Z`,
                prevStart: `${prevStartDateStr}T00:00:00.000Z`,
                prevEnd: `${prevEndDateStr}T23:59:59.999Z`
            };
        }
    }, [period, user?.preferences]);

    const { data: categories } = trpc.category.list.useQuery();
    const { data: balanceData } = trpc.account.getTotalBalance.useQuery();
    const { data: stats, isLoading: isCurrentLoading } = trpc.transaction.getSpendingStats.useQuery({
        startDate: dateRange.start,
        endDate: dateRange.end,
        categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    }, {
        enabled: categoryIds.length > 0, // Only fetch when categories are selected
    });

    const { data: prevStats, isLoading: isPrevLoading } = trpc.transaction.getSpendingStats.useQuery({
        startDate: dateRange.prevStart,
        endDate: dateRange.prevEnd,
        categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    }, {
        enabled: categoryIds.length > 0 && !!dateRange.prevStart,
    });

    const isLoading = isCurrentLoading || isPrevLoading;

    const currentTotal = stats?.total || 0;
    const prevTotal = prevStats?.total || 0;
    const diff = currentTotal - prevTotal;
    const percentChange = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;

    const chartData = useMemo(() => {
        if (!stats?.timeSeriesData) return [];

        return stats.timeSeriesData.map((item: any) => {
            const currentDate = new Date(item.date);
            let prevDate;
            if (period === 'weekly') {
                prevDate = subWeeks(currentDate, 1);
            } else {
                prevDate = subMonths(currentDate, 1);
            }
            const prevDateStr = format(prevDate, 'yyyy-MM-dd');
            const prevItem = prevStats?.timeSeriesData?.find((d: any) => d.date === prevDateStr);

            return {
                ...item,
                prevAmount: prevItem?.amount || 0
            };
        });
    }, [stats, prevStats, period]);

    const currencyCode = useMemo(() => {
        if (!balanceData?.balances) return 'USD';
        const activeBalances = Object.entries(balanceData.balances)
            .filter(([_, amount]) => amount !== 0);
        return activeBalances.length > 0 ? activeBalances[0][0] : 'USD';
    }, [balanceData]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    // Transform categories for MultiSelect
    const categoryOptions = categories
        ?.filter((cat: any) => cat.type !== 'income')
        .map((cat: any) => ({
            label: cat.name,
            value: cat.id,
            icon: <span className="mr-1">{cat?.icon}</span>
        })) || [];

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col', isCompact && 'dashboard-widget--compact')}>
            <CardHeader className="pb-2 px-3 pt-3">
                <div className="flex items-center justify-between gap-2">
                    <Link to="/spending" className="min-w-0 flex-1 group/header">
                        <CardTitle className="dashboard-widget__title text-xs sm:text-sm truncate font-bold group-hover/header:underline">Spending Overview</CardTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm sm:text-base font-bold whitespace-nowrap">{formatCurrency(currentTotal)}</span>
                            {categoryIds.length > 0 && !isLoading && (
                                <div className={cn(
                                    "flex items-center text-[10px] font-medium whitespace-nowrap",
                                    diff > 0 ? "text-destructive" : diff < 0 ? "text-emerald-500" : "text-muted-foreground"
                                )}>
                                    {diff > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : diff < 0 ? <TrendingDown className="h-3 w-3 mr-0.5" /> : null}
                                    {prevTotal > 0 ? `${Math.abs(percentChange).toFixed(0)}%` : 'New'}
                                    {!isNarrow && (
                                        <span className="ml-1 text-muted-foreground font-normal">vs prev.</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </Link>
                    <div className="flex gap-1 sm:gap-1.5 items-center flex-shrink-0">
                        {!isNarrow && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={handleSavePreferences}
                                title="Save current filters as default"
                            >
                                <Save className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <div className={cn('max-w-[100px] sm:max-w-[150px]', isCompact && 'max-w-[80px]')}>
                            <MultiSelect
                                options={categoryOptions}
                                selected={categoryIds}
                                onChange={setCategoryIds}
                                placeholder="All Categories"
                                className={cn(
                                    'h-7 sm:h-8 px-2 py-0',
                                    'text-[10px] sm:text-xs font-medium bg-muted/50 border-none hover:bg-muted focus:ring-0',
                                    isCompact && 'h-6 text-[9px]'
                                )}
                            />
                        </div>
                        <Tabs value={period} onValueChange={(v) => setPeriod(v as 'weekly' | 'monthly')}>
                            <TabsList className={cn('h-7 sm:h-8 bg-muted/50 p-1', isCompact && 'h-6 p-0.5')}>
                                <TabsTrigger
                                    value="weekly"
                                    className={cn(
                                        'h-full px-2 text-[10px] sm:text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm',
                                        isCompact && 'px-1.5 text-[9px]'
                                    )}
                                >
                                    W
                                </TabsTrigger>
                                <TabsTrigger
                                    value="monthly"
                                    className={cn(
                                        'h-full px-2 text-[10px] sm:text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm',
                                        isCompact && 'px-1.5 text-[9px]'
                                    )}
                                >
                                    M
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-1 sm:px-2 py-1 sm:py-2 flex-1 min-h-0 relative">
                {categoryIds.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-muted-foreground px-4">
                            <p className="text-sm font-medium mb-1">Select categories to view spending</p>
                            <p className="text-xs">Choose one or more categories from the dropdown above</p>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                        <Skeleton className="h-[90%] w-[95%]" />
                    </div>
                ) : (
                    <div className="flex h-full w-full overflow-visible">
                        {/* Custom Bar Chart with backdrop blur */}
                        <div
                            className="flex-1 min-w-0 h-full relative group rounded-xl overflow-visible"
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const tooltip = e.currentTarget.querySelector('[data-tooltip]') as HTMLElement;
                                if (tooltip) {
                                    const tooltipWidth = 120; // approximate tooltip width
                                    const mouseX = e.clientX - rect.left;
                                    const mouseY = e.clientY - rect.top;

                                    // Position tooltip to the left if near right edge
                                    let left = mouseX + 10;
                                    if (mouseX > rect.width - tooltipWidth) {
                                        left = mouseX - tooltipWidth - 10;
                                    }

                                    // Keep tooltip above cursor, but not above container
                                    let top = mouseY - 60;
                                    if (top < 0) top = mouseY + 20;

                                    tooltip.style.left = `${left}px`;
                                    tooltip.style.top = `${top}px`;
                                }
                            }}
                        >
                            {/* Inner glow ring */}
                            <div className="absolute inset-0 rounded-xl pointer-events-none ring-1 ring-purple-500/20" />

                            {/* Cursor-following tooltip */}
                            <div
                                data-tooltip
                                className="absolute opacity-0 transition-opacity duration-150 z-50 pointer-events-none"
                                style={{ left: 0, top: 0 }}
                            >
                                <div className="rounded-xl border border-purple-200/50 dark:border-purple-800/50 bg-background/70 backdrop-blur-xl px-2.5 py-1.5 shadow-2xl ring-1 ring-white/10 whitespace-nowrap">
                                    <div data-tooltip-date className="mb-0.5 text-[9px] font-medium text-muted-foreground uppercase tracking-wider"></div>
                                    <div data-tooltip-amount className="text-sm font-bold text-foreground"></div>
                                </div>
                            </div>

                            {/* Custom HTML-based bar chart for backdrop blur support */}
                            <div className="absolute inset-0 p-4 pt-6 pb-8 flex">
                                {/* Y-axis */}
                                <div className="w-10 flex flex-col justify-between text-right pr-2 pb-6">
                                    {(() => {
                                        const currentMax = Math.max(...(stats?.timeSeriesData || []).map((d: any) => d.amount), 0);
                                        const prevMax = Math.max(...(prevStats?.timeSeriesData || []).map((d: any) => d.amount), 0);
                                        const maxAmount = Math.max(currentMax, prevMax, 1);
                                        const steps = [maxAmount, maxAmount * 0.75, maxAmount * 0.5, maxAmount * 0.25, 0];
                                        return steps.map((val, i) => (
                                            <span key={i} className="text-[9px] text-muted-foreground/60 font-medium leading-none">
                                                {formatAmountAbbreviated(val)}
                                            </span>
                                        ));
                                    })()}
                                </div>

                                {/* Chart area with grid lines */}
                                <div className="flex-1 flex flex-col relative">
                                    {/* Horizontal grid lines - behind bars */}
                                    <div className="absolute inset-0 bottom-6 flex flex-col justify-between pointer-events-none z-0">
                                        {[0, 1, 2, 3, 4].map((i) => (
                                            <div key={i} className="w-full h-px" style={{ backgroundImage: 'linear-gradient(to right, rgba(168, 85, 247, 0.6) 50%, transparent 50%)', backgroundSize: '8px 1px' }} />
                                        ))}
                                    </div>

                                    <div className="flex-1 flex items-end justify-around gap-0.5 sm:gap-1 relative z-10">
                                        {chartData.map((item: any, index: number) => {
                                            const currentMax = Math.max(...(stats?.timeSeriesData || []).map((d: any) => d.amount), 0);
                                            const prevMax = Math.max(...(prevStats?.timeSeriesData || []).map((d: any) => d.amount), 0);
                                            const maxAmount = Math.max(currentMax, prevMax, 1);

                                            const heightPercent = (item.amount / maxAmount) * 100;
                                            const prevHeightPercent = (item.prevAmount / maxAmount) * 100;

                                            return (
                                                <div key={index} className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-0">
                                                    <div className="flex items-end gap-[1px] w-full justify-center h-full px-[1px]">
                                                        {/* Previous Bar */}
                                                        {prevTotal > 0 && (
                                                            <div
                                                                className="flex-1 max-w-[12px] rounded-t-[1px] sm:rounded-t-sm bg-muted/20 border-t border-x border-muted-foreground/10 transition-all duration-300"
                                                                style={{
                                                                    height: `${Math.max(prevHeightPercent, 1)}%`,
                                                                }}
                                                            />
                                                        )}
                                                        {/* Current Bar */}
                                                        <div
                                                            className="flex-[1.5] max-w-[20px] rounded-t-[1px] sm:rounded-t-sm border sm:border-2 border-purple-500 backdrop-blur-[2px] transition-all duration-300 hover:scale-110 cursor-pointer z-10"
                                                            style={{
                                                                height: `${Math.max(heightPercent, 2)}%`,
                                                                backgroundColor: 'rgba(139, 92, 246, 0.2)'
                                                            }}
                                                            data-date={item.date}
                                                            data-amount={item.amount}
                                                            data-prev-amount={item.prevAmount}
                                                            onMouseEnter={(e) => {
                                                                const chartContainer = e.currentTarget.closest('.rounded-xl') as HTMLElement;
                                                                const tooltip = chartContainer?.querySelector('[data-tooltip]') as HTMLElement;
                                                                const dateEl = tooltip?.querySelector('[data-tooltip-date]');
                                                                const amountEl = tooltip?.querySelector('[data-tooltip-amount]');
                                                                if (tooltip && dateEl && amountEl) {
                                                                    const dateText = format(new Date(item.date), 'EEE, MMM do');
                                                                    const currentVal = formatCurrency(item.amount);
                                                                    const prevVal = formatCurrency(item.prevAmount);

                                                                    dateEl.textContent = dateText;
                                                                    amountEl.innerHTML = `
                                                                        <div class="flex flex-col gap-0.5">
                                                                            <div class="flex justify-between gap-4">
                                                                                <span class="text-muted-foreground">This:</span>
                                                                                <span class="font-bold">${currentVal}</span>
                                                                            </div>
                                                                            ${prevTotal > 0 ? `
                                                                            <div class="flex justify-between gap-4 text-[10px]">
                                                                                <span class="text-muted-foreground">Last:</span>
                                                                                <span>${prevVal}</span>
                                                                            </div>` : ''}
                                                                        </div>
                                                                    `;
                                                                    tooltip.classList.remove('opacity-0');
                                                                    tooltip.classList.add('opacity-100');
                                                                }
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                const chartContainer = e.currentTarget.closest('.rounded-xl') as HTMLElement;
                                                                const tooltip = chartContainer?.querySelector('[data-tooltip]') as HTMLElement;
                                                                if (tooltip) {
                                                                    tooltip.classList.remove('opacity-100');
                                                                    tooltip.classList.add('opacity-0');
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    {/* X-axis label */}
                                                    <span className="text-[9px] sm:text-[10px] text-muted-foreground/60 font-medium h-5 flex items-center truncate">
                                                        {format(new Date(item.date), period === 'weekly' ? 'EEE' : (isNarrow ? 'd' : 'dd'))}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
