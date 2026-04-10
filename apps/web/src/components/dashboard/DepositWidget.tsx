import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PiggyBank, TrendingUp, ArrowRight, Wallet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Link } from '@tanstack/react-router';
import { WidgetFooter } from './WidgetFooter';

type GridParams = { w: number; h: number; breakpoint?: string };

export function DepositWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: deposits, isLoading } = trpc.deposit.list.useQuery();
    const activeDeposits = (deposits || []).filter((d: any) => d.status === 'active');
    
    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    const totalBalance = activeDeposits.reduce((sum: number, d: any) => sum + Number(d.currentBalance), 0);
    const totalPrincipal = activeDeposits.reduce((sum: number, d: any) => sum + Number(d.principalAmount), 0);
    const totalEarned = totalBalance - totalPrincipal;
    
    const visibleDeposits = isTall ? activeDeposits.slice(0, 4) : activeDeposits.slice(0, 2);

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

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group rounded-[32px] overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <Link to="/financial/deposits" className="block flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-xl cursor-pointer">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Savings & Deposits</div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                                <CurrencyDisplay amount={totalBalance} abbreviate={totalBalance > 1000000} />
                            </span>
                            {totalEarned > 0 && (
                                <div className="flex items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-500">
                                    <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                                    +<CurrencyDisplay amount={totalEarned} abbreviate />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="p-1.5 bg-emerald-500/10 rounded-md group-hover:bg-emerald-500/20 transition-colors">
                        <PiggyBank className="h-4 w-4 text-emerald-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {activeDeposits.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-center py-4">
                                <p className="text-[10px] text-muted-foreground italic uppercase tracking-wider">No active deposits</p>
                            </div>
                        ) : (
                            visibleDeposits.map((deposit: any) => (
                                <div key={deposit.id} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors group/item">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <Wallet className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-bold truncate leading-tight">{deposit.depositName}</span>
                                            <span className="text-[8px] text-muted-foreground uppercase">{deposit.interestRate}% APR • {deposit.compoundingFrequency}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold">
                                            <CurrencyDisplay amount={Number(deposit.currentBalance)} currency={deposit.currency} abbreviate />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Link>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                    {activeDeposits.length} Active
                </span>
                <Link to="/financial/deposits" className="text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Details <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
