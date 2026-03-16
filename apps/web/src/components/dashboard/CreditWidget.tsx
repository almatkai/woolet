import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CreditCard, Check, X, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { getPaymentStatusOptions, getTargetMonthStr, isPaidForTargetMonth } from "@/lib/payment-status";
import { Link } from '@tanstack/react-router';
import { WidgetFooter } from './WidgetFooter';

type GridParams = { w: number; h: number; breakpoint?: string };

export function CreditWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: credits, isLoading } = trpc.credit.list.useQuery();
    const { data: settings } = trpc.settings.getUserSettings.useQuery();
    const activeCredits = (credits || []).filter((c: any) => c.status === 'active');
    
    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    const { logic, period } = getPaymentStatusOptions(settings, 'credit');
    const monthlyPayment = activeCredits.reduce((sum: number, c: any) => sum + Number(c.monthlyPayment), 0);
    
    const allPaidThisMonth = activeCredits.every((c: any) => {
        const targetMonthStr = getTargetMonthStr(c.billingDay, { logic, period });
        return isPaidForTargetMonth(c.payments, targetMonthStr, true);
    });
    
    const visibleCredits = isTall ? activeCredits.slice(0, 4) : activeCredits.slice(0, 2);

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
            <Link to="/financial/credits" className="block flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-xl cursor-pointer">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Credits & Loans</div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                                <CurrencyDisplay amount={monthlyPayment} currency={settings?.defaultCurrency || "USD"} abbreviate={monthlyPayment > 1000000} />
                                <span className="text-[10px] text-muted-foreground font-medium ml-1">due this month</span>
                            </span>
                        </div>
                    </div>
                    <div className={cn(
                        "p-1.5 rounded-md transition-colors",
                        allPaidThisMonth ? "bg-emerald-500/10 group-hover:bg-emerald-500/20" : "bg-rose-500/10 group-hover:bg-rose-500/20"
                    )}>
                        <CreditCard className={cn("h-4 w-4", allPaidThisMonth ? "text-emerald-500" : "text-rose-500")} />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {activeCredits.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-center py-4">
                                <p className="text-[10px] text-muted-foreground italic uppercase tracking-wider">No active credits</p>
                            </div>
                        ) : (
                            visibleCredits.map((credit: any) => {
                                const targetMonthStr = getTargetMonthStr(credit.billingDay, { logic, period });
                                const isPaid = isPaidForTargetMonth(credit.payments, targetMonthStr, true);
                                return (
                                    <div key={credit.id} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors group/item">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            {isPaid ? (
                                                <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                            ) : (
                                                <X className="h-3 w-3 text-rose-500 flex-shrink-0" />
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] font-bold truncate leading-tight">{credit.name}</span>
                                                <span className="text-[8px] text-muted-foreground uppercase">Day {credit.billingDay}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-bold">
                                                <CurrencyDisplay amount={Number(credit.monthlyPayment)} currency={credit.currency} abbreviate />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </CardContent>
            </Link>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    {allPaidThisMonth ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <X className="h-2.5 w-2.5 text-rose-500" />}
                    {allPaidThisMonth ? 'All Paid' : 'Pending Payments'}
                </span>
                <Link to="/financial/credits" className="text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Details <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
