import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Users, ArrowRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Link } from '@tanstack/react-router';
import { WidgetFooter } from './WidgetFooter';

type GridParams = { w: number; h: number; breakpoint?: string };

export function DebtsWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: debtsData, isLoading } = trpc.debt.list.useQuery({});
    const debts = debtsData?.debts || [];
    const activeDebts = debts.filter((d: any) => d.status !== 'paid');

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    const iOweDebts = activeDebts.filter((d: any) => d.type === 'i_owe');
    const theyOweDebts = activeDebts.filter((d: any) => d.type === 'they_owe');
    
    const totalIOwe = iOweDebts.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
    const totalTheyOwe = theyOweDebts.reduce((sum: number, d: any) => sum + Number(d.amount), 0);

    const visibleIOwe = isTall ? iOweDebts.slice(0, 2) : iOweDebts.slice(0, 1);
    const visibleTheyOwe = isTall ? theyOweDebts.slice(0, 2) : theyOweDebts.slice(0, 1);

    if (isLoading) {
        return (
            <Card className="dashboard-widget h-full overflow-hidden">
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

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Debts & Loans</div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap text-rose-600 dark:text-rose-500">
                                <CurrencyDisplay amount={-totalIOwe} abbreviate={totalIOwe > 1000000} />
                            </span>
                            {totalTheyOwe > 0 && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-500 font-bold">
                                    +<CurrencyDisplay amount={totalTheyOwe} abbreviate /> receivable
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="p-1.5 bg-amber-500/10 rounded-md group-hover:bg-amber-500/20 transition-colors">
                        <Users className="h-4 w-4 text-amber-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {activeDebts.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-center py-4">
                                <p className="text-[10px] text-muted-foreground italic uppercase tracking-wider">No active debts</p>
                            </div>
                        ) : (
                            <>
                                {visibleIOwe.map((debt: any) => (
                                    <div key={debt.id} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 transition-colors group/item">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            <ArrowUpRight className="h-3 w-3 text-rose-500 flex-shrink-0" />
                                            <span className="text-[10px] font-bold truncate leading-tight">{debt.personName}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-rose-600 whitespace-nowrap">
                                            <CurrencyDisplay amount={-Number(debt.amount)} currency={debt.currencyBalance?.currencyCode || debt.currencyCode} abbreviate />
                                        </span>
                                    </div>
                                ))}
                                {visibleTheyOwe.map((debt: any) => (
                                    <div key={debt.id} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors group/item">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            <ArrowDownLeft className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                            <span className="text-[10px] font-bold truncate leading-tight">{debt.personName}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">
                                            <CurrencyDisplay amount={Number(debt.amount)} currency={debt.currencyBalance?.currencyCode || debt.currencyCode} abbreviate />
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </CardContent>
            </div>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                    {activeDebts.length} People
                </span>
                <Link to="/debts" className="dashboard-widget__footer-action text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Manage <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
