import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Link } from '@tanstack/react-router';

type GridParams = { w: number; h: number; breakpoint?: string };

export function DebtsWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: debtsData, isLoading } = trpc.debt.list.useQuery({});
    const debts = debtsData?.debts || [];
    const activeDebts = debts.filter((d: any) => d.status !== 'paid');
    const maxItems = gridParams?.h && gridParams.h <= 2 ? 2 : 3;

    // Separate debts by type
    const iOweDebts = activeDebts.filter((d: any) => d.type === 'i_owe');
    const theyOweDebts = activeDebts.filter((d: any) => d.type === 'they_owe');
    const compactDebtDetails = [...activeDebts]
        .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
        .slice(0, 2);

    const totalIOwe = iOweDebts.reduce((sum: number, d: any) => sum + Number(d.amount), 0);

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const compactHeightThreshold = isSmallBp ? 2 : 1;
    const isNarrowCard = (gridParams?.w ?? 0) <= 1 && (gridParams?.h ?? 0) <= 2;
    const isCompact = (gridParams?.h ?? 0) <= compactHeightThreshold || isNarrowCard;
    const hideSubtitle = (gridParams?.h ?? 0) === 1;

    if (isCompact) {
        if (isLoading) {
            return (
                <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                    <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                        <CardTitle className="dashboard-widget__title truncate">Debts</CardTitle>
                        <Skeleton className="h-4 w-16" />
                    </CardHeader>
                    <CardContent className="p-2 pt-1 pb-2 flex-1 flex items-end">
                        <Skeleton className="h-3 w-28" />
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/debts" className="block">
                    <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate">Debts</CardTitle>
                        <div className={cn('dashboard-widget__header-value', totalIOwe > 0 ? 'text-red-600' : 'text-gray-500')}>
                            {totalIOwe > 0 ? (
                                <CurrencyDisplay amount={-totalIOwe} abbreviate />
                            ) : '0'}
                        </div>
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-1 pb-2 flex-1 flex flex-col">
                    <div className="flex-1 space-y-1 overflow-hidden">
                        {compactDebtDetails.map((debt: any) => {
                            const isIOwe = debt.type === 'i_owe';
                            const debtAmount = Number(debt.amount);
                            return (
                                <div
                                    key={debt.id}
                                    className="dashboard-widget__item flex items-center justify-between gap-2 rounded bg-muted/30 px-1.5 py-1"
                                >
                                    <span className="truncate flex-1">{debt.personName}</span>
                                    <span className={cn('whitespace-nowrap', isIOwe ? 'text-red-600' : 'text-green-600')}>
                                        <CurrencyDisplay
                                            amount={isIOwe ? -debtAmount : debtAmount}
                                            currency={debt.currencyBalance?.currencyCode || debt.currencyCode}
                                            abbreviate
                                            showSign={!isIOwe}
                                        />
                                    </span>
                                </div>
                            );
                        })}
                        {compactDebtDetails.length === 0 && (
                            <p className="dashboard-widget__meta truncate">No active debts</p>
                        )}
                    </div>
                    <p className="dashboard-widget__sub w-full truncate mt-auto">
                        {activeDebts.length} active {activeDebts.length === 1 ? 'debt' : 'debts'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col', isCompact && 'dashboard-widget--compact')}>
            <Link to="/debts" className="block">
                <CardHeader className="dashboard-widget__header hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                        <CardTitle className="dashboard-widget__title truncate">Debts</CardTitle>
                        <Users className="dashboard-widget__icon flex-shrink-0" />
                    </div>
                    {hideSubtitle ? null : (
                        <CardDescription className="dashboard-widget__desc truncate">
                            People you owe & who owe you
                        </CardDescription>
                    )}
                </CardHeader>
            </Link>
            <CardContent className={cn('flex-1 overflow-y-auto p-3 pt-0', isCompact && 'p-2 pt-1 pb-2')}>
                {isLoading ? (
                    <div className="space-y-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                ) : activeDebts.length === 0 ? (
                    <p className="dashboard-widget__desc">No active debts.</p>
                ) : (
                    <div className="space-y-2">
                        {iOweDebts.length > 0 && (
                            <div className="space-y-1">
                                <p className="dashboard-widget__meta font-medium text-red-600">You Owe ({iOweDebts.length})</p>
                                <div className="space-y-0.5">
                                    {iOweDebts.slice(0, maxItems).map((debt: any) => (
                                        <div key={debt.id} className="dashboard-widget__item flex items-center justify-between gap-2">
                                            <span className="truncate flex-1 min-w-0">{debt.personName}</span>
                                            <span className="font-medium text-red-600 whitespace-nowrap flex-shrink-0">
                                                <CurrencyDisplay 
                                                    amount={debt.amount} 
                                                    currency={debt.currencyBalance?.currencyCode || debt.currencyCode} 
                                                />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {theyOweDebts.length > 0 && (
                            <div className="space-y-1">
                                <p className="dashboard-widget__meta font-medium text-green-600">They Owe ({theyOweDebts.length})</p>
                                <div className="space-y-0.5">
                                    {theyOweDebts.slice(0, maxItems).map((debt: any) => (
                                        <div key={debt.id} className="dashboard-widget__item flex items-center justify-between gap-2">
                                            <span className="truncate flex-1 min-w-0">{debt.personName}</span>
                                            <span className="font-medium text-green-600 whitespace-nowrap flex-shrink-0">
                                                <CurrencyDisplay 
                                                    amount={debt.amount} 
                                                    currency={debt.currencyBalance?.currencyCode || debt.currencyCode} 
                                                />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
