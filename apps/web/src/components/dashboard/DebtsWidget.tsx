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

    const totalIOwe = iOweDebts.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
    const totalTheyOwe = theyOweDebts.reduce((sum: number, d: any) => sum + Number(d.amount), 0);

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const compactHeightThreshold = isSmallBp ? 2 : 1;
    const isCompact = (gridParams?.h ?? 0) <= compactHeightThreshold;
    const hideSubtitle = (gridParams?.h ?? 0) === 1;

    if (isCompact) {
        if (isLoading) {
            return (
                <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                        <CardTitle className="dashboard-widget__title truncate text-sm">Debts</CardTitle>
                        <Users className="dashboard-widget__icon" />
                    </CardHeader>
                    <CardContent className="p-2 pt-0">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-3 w-28 mt-1" />
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/debts" className="block">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate text-sm">Debts</CardTitle>
                        <Users className="dashboard-widget__icon" />
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-0">
                    <div className={cn('dashboard-widget__value truncate', totalIOwe > 0 ? 'text-red-600' : 'text-gray-500')}>
                        {totalIOwe > 0 ? (
                            <CurrencyDisplay amount={-totalIOwe} abbreviate />
                        ) : '0'}
                    </div>
                    {totalTheyOwe > 0 ? (
                        <div className="dashboard-widget__sub text-green-600 mt-0.5 truncate">
                            <CurrencyDisplay amount={totalTheyOwe} showSign abbreviate /> incoming
                        </div>
                    ) : (
                        <p className="dashboard-widget__sub mt-0.5 truncate">
                            {activeDebts.length} active {activeDebts.length === 1 ? 'debt' : 'debts'}
                        </p>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col', isCompact && 'dashboard-widget--compact')}>
            <Link to="/debts" className="block">
                <CardHeader className={cn('p-3 pb-1 hover:bg-muted/50 transition-colors', isCompact && 'p-2 pb-1')}>
                    <div className="flex items-center justify-between">
                        <CardTitle className="dashboard-widget__title truncate text-sm">Debts</CardTitle>
                        <Users className="dashboard-widget__icon flex-shrink-0" />
                    </div>
                    {hideSubtitle ? null : (
                        <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">
                            People you owe & who owe you
                        </CardDescription>
                    )}
                </CardHeader>
            </Link>
            <CardContent className={cn('flex-1 overflow-y-auto p-3 pt-0', isCompact && 'p-2 pt-0')}>
                {isLoading ? (
                    <div className="space-y-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                ) : activeDebts.length === 0 ? (
                    <p className="dashboard-widget__desc text-[10px] sm:text-xs">No active debts.</p>
                ) : (
                    <div className="space-y-2">
                        {iOweDebts.length > 0 && (
                            <div className="space-y-1">
                                <p className="dashboard-widget__meta font-medium text-red-600">You Owe ({iOweDebts.length})</p>
                                <div className="space-y-0.5">
                                    {iOweDebts.slice(0, maxItems).map((debt: any) => (
                                        <div key={debt.id} className="dashboard-widget__item flex items-center justify-between">
                                            <span className="truncate pr-1">{debt.personName}</span>
                                            <span className="font-medium text-red-600 whitespace-nowrap">
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
                                        <div key={debt.id} className="dashboard-widget__item flex items-center justify-between">
                                            <span className="truncate pr-1">{debt.personName}</span>
                                            <span className="font-medium text-green-600 whitespace-nowrap">
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
