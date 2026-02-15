import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { TooltipPro } from '@/components/ui/tooltip-pro';

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CHF: 'CHF',
    CAD: 'C$',
    AUD: 'A$',
    NZD: 'NZ$',
    CNY: '¥',
    INR: '₹',
    HKD: 'HK$',
    SGD: 'S$',
    KRW: '₩',
    MXN: 'MX$',
    BRL: 'R$',
    PLN: 'zł',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
    CZK: 'Kč',
    HUF: 'Ft',
    TRY: '₺',
    ZAR: 'R',
    THB: '฿',
};

const CURRENCY_FLAGS: Record<string, string> = {
    USD: '🇺🇸',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    CHF: '🇨🇭',
    CAD: '🇨🇦',
    AUD: '🇦🇺',
    NZD: '🇳🇿',
    CNY: '🇨🇳',
    INR: '🇮🇳',
    HKD: '🇭🇰',
    SGD: '🇸🇬',
    KRW: '🇰🇷',
    MXN: '🇲🇽',
    BRL: '🇧🇷',
    PLN: '🇵🇱',
    SEK: '🇸🇪',
    NOK: '🇳🇴',
    DKK: '🇩🇰',
    CZK: '🇨🇿',
    HUF: '🇭🇺',
    TRY: '🇹🇷',
    ZAR: '🇿🇦',
    THB: '🇹🇭',
};

interface CurrencyExchangeWidgetProps {
    gridParams?: { w: number; h: number };
}

export function CurrencyExchangeWidget({ gridParams }: CurrencyExchangeWidgetProps) {
    const [selectedPair, setSelectedPair] = useState<{ from: string; to: string } | null>(null);
    const [isReversed, setIsReversed] = useState(false);

    // Get user's default currency
    const { data: userSettings } = trpc.settings.getUserSettings.useQuery();
    const baseCurrency = userSettings?.defaultCurrency || 'USD';

    const { data: exchangeRates, isLoading, error } = trpc.currency.getExchangeRates.useQuery({
        baseCurrency,
    });

    const { data: historyData } = trpc.currency.getRateHistory.useQuery(
        {
            fromCurrency: selectedPair?.from || baseCurrency,
            toCurrency: selectedPair?.to || 'EUR',
            days: 30,
        },
        {
            enabled: !!selectedPair && (gridParams?.w || 0) >= 2 && (gridParams?.h || 0) >= 3,
        }
    );

    const isCompact = (gridParams?.h ?? 0) <= 1;
    const isMedium = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) === 2;
    const isLarge = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) >= 3;

    // Top currency pairs to display (ordered by global trading volume)
    const topCurrencies = ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'CHF', 'AUD', 'CAD', 'HKD', 'SGD', 'INR', 'KRW', 'SEK', 'MXN', 'NZD'];
    const displayCurrencies = topCurrencies.filter(c => c !== baseCurrency).slice(0, isCompact ? 3 : isMedium ? 6 : 10);

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

    if (error) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <CardTitle className="dashboard-widget__title truncate">Exchange Rates</CardTitle>
                    <ArrowRightLeft className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <p className="text-sm text-muted-foreground">Unable to load rates</p>
                </CardContent>
            </Card>
        );
    }

    // Compact view - just show count and primary rate
    if (isCompact) {
        const primaryCurrency = isReversed ? baseCurrency : (displayCurrencies[0] || 'EUR');
        const rate = isReversed 
            ? (1 / (exchangeRates?.[displayCurrencies[0]] || 1))
            : (exchangeRates?.[displayCurrencies[0]] || 0);
        const fromCurrency = isReversed ? displayCurrencies[0] : baseCurrency;
        const toCurrency = isReversed ? baseCurrency : displayCurrencies[0];
        
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/accounts" className="block">
                    <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate">Exchange Rates</CardTitle>
                        <div className="dashboard-widget__header-value">
                            {rate.toFixed(rate >= 1 ? 2 : 4)}
                        </div>
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-1 pb-2 flex-1 flex items-end">
                    <div className="dashboard-widget__sub w-full truncate">
                        {fromCurrency} {'->'} {toCurrency} • {Object.keys(exchangeRates || {}).length} currencies
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Medium view - grid of rates
    if (isMedium && !isLarge) {
        return (
            <Card className="dashboard-widget h-full flex flex-col">
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <Link to="/accounts" className="flex-1 min-w-0">
                        <div className="hover:underline">
                            <CardTitle className="dashboard-widget__title truncate">Exchange Rates</CardTitle>
                            <CardDescription className="dashboard-widget__desc truncate">
                                {isReversed ? `To ${baseCurrency}` : `From ${baseCurrency}`}
                            </CardDescription>
                        </div>
                    </Link>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsReversed(!isReversed); }}
                        className="dashboard-widget__icon cursor-pointer hover:text-primary transition-colors"
                    >
                        <ArrowRightLeft className="h-4 w-4" />
                    </button>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-3 pt-0">
                    <div className="grid grid-cols-2 gap-2">
                        {displayCurrencies.map((currency) => {
                            const rate = exchangeRates?.[currency] || 0;
                            const displayRate = isReversed ? (1 / rate) : rate;
                            const fromCurrency = isReversed ? currency : baseCurrency;
                            const toCurrency = isReversed ? baseCurrency : currency;
                            
                            return (
                                <div
                                    key={currency}
                                    className="dashboard-widget__item rounded-md bg-muted/50 p-2"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">{CURRENCY_FLAGS[currency]}</span>
                                        <span className="font-medium text-xs">{fromCurrency}→{toCurrency}</span>
                                    </div>
                                    <div className="text-sm font-semibold mt-0.5">
                                        {displayRate.toFixed(displayRate >= 1 ? 2 : 4)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Large view - chart and detailed list
    const chartData = historyData?.map((item: { date: string; rate: number }) => ({
        date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rate: item.rate,
    })).reverse() || [];

    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                <Link to="/accounts" className="flex-1 min-w-0">
                    <div className="hover:underline">
                        <CardTitle className="dashboard-widget__title truncate">Exchange Rates</CardTitle>
                        <CardDescription className="dashboard-widget__desc truncate">
                            {isReversed ? `To ${baseCurrency}` : `From ${baseCurrency}`}
                        </CardDescription>
                    </div>
                </Link>
                <button 
                    onClick={(e) => { e.stopPropagation(); setIsReversed(!isReversed); }}
                    className="dashboard-widget__icon cursor-pointer hover:text-primary transition-colors"
                >
                    <ArrowRightLeft className="h-4 w-4" />
                </button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col gap-3">
                {/* Chart Section */}
                {selectedPair && chartData.length > 0 && (
                    <div className="h-32">
                        <div className="text-xs font-medium mb-1">
                            {selectedPair.from}/{selectedPair.to} - Last 30 Days
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    domain={['auto', 'auto']}
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    axisLine={false}
                                />

                                <Line
                                    type="monotone"
                                    dataKey="rate"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Currency List */}
                <ScrollArea className="flex-1">
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground px-1">
                            {isReversed ? `1 USD = X ${baseCurrency}` : `1 ${baseCurrency} = X`}
                        </div>
                        {displayCurrencies.map((currency) => {
                            const rate = exchangeRates?.[currency] || 0;
                            const displayRate = isReversed ? (1 / rate) : rate;
                            const fromCurrency = isReversed ? currency : baseCurrency;
                            const toCurrency = isReversed ? baseCurrency : currency;
                            const isSelected = selectedPair?.to === currency;
                            return (
                                <div
                                    key={currency}
                                    className={cn(
                                        'dashboard-widget__item cursor-pointer hover:bg-muted/50 transition-colors rounded-md p-2',
                                        isSelected && 'bg-muted'
                                    )}
                                    onClick={() => setSelectedPair({ from: baseCurrency, to: currency })}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{CURRENCY_FLAGS[currency]}</span>
                                            <div>
                                                <div className="font-medium text-sm">{isReversed ? `${currency}→${baseCurrency}` : currency}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {CURRENCY_SYMBOLS[currency]}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold">{displayRate.toFixed(displayRate >= 1 ? 2 : 4)}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
