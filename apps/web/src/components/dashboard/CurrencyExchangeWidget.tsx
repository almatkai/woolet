import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowRightLeft, TrendingUp, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { WidgetFooter } from './WidgetFooter';

const CURRENCY_FLAGS: Record<string, string> = {
    USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭',
    CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CNY: '🇨🇳', INR: '🇮🇳',
    HKD: '🇭🇰', SGD: '🇸🇬', KRW: '🇰🇷', MXN: '🇲🇽', BRL: '🇧🇷',
    PLN: '🇵🇱', SEK: '🇸🇪', NOK: '🇳🇴', DKK: '🇩🇰', CZK: '🇨🇿',
    HUF: '🇭🇺', TRY: '🇹🇷', ZAR: '🇿🇦', THB: '🇹🇭', KZT: '🇰🇿',
};

type GridParams = { w: number; h: number; breakpoint?: string };

export function CurrencyExchangeWidget({ gridParams }: { gridParams?: GridParams }) {
    const [isReversed, setIsReversed] = useState(true);

    const { data: userSettings } = trpc.settings.getUserSettings.useQuery();
    const baseCurrency = userSettings?.defaultCurrency || 'USD';

    const { data: exchangeRates, isLoading } = trpc.currency.getExchangeRates.useQuery({
        baseCurrency,
    });

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    const topCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'KZT'];
    const displayCurrencies = topCurrencies.filter(c => c !== baseCurrency).slice(0, isTall ? 4 : 2);

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

    const primaryTarget = displayCurrencies[0] || 'EUR';
    const rate = exchangeRates?.[primaryTarget] || 0;
    const displayRate = isReversed ? (1 / rate) : rate;

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group rounded-[32px] overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <div className="flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-xl cursor-pointer" onClick={() => setIsReversed(!isReversed)}>
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Exchange Rates</div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                                {displayRate.toFixed(displayRate >= 1 ? 2 : 4)}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium uppercase">
                                {isReversed ? `${primaryTarget}/${baseCurrency}` : `${baseCurrency}/${primaryTarget}`}
                            </span>
                        </div>
                    </div>
                    <div className="p-1.5 bg-indigo-500/10 rounded-md group-hover:bg-indigo-500/20 transition-colors">
                        <ArrowRightLeft className="h-4 w-4 text-indigo-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {displayCurrencies.map((currency) => {
                            const r = exchangeRates?.[currency] || 0;
                            const dRate = isReversed ? (1 / r) : r;
                            return (
                                <div key={currency} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <span className="text-sm leading-none flex-shrink-0">{CURRENCY_FLAGS[currency]}</span>
                                        <span className="text-[10px] font-bold truncate uppercase">{currency}</span>
                                    </div>
                                    <span className="text-[10px] font-bold whitespace-nowrap">
                                        {dRate.toFixed(dRate >= 1 ? 2 : 4)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </div>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="h-2.5 w-2.5" />
                    Market Rates
                </span>
                <Link to="/accounts" className="text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Details <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
