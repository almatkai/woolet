import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Repeat, Calendar, ArrowRight, Bell } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Link } from '@tanstack/react-router';
import { WidgetFooter } from './WidgetFooter';

interface Subscription {
    id: string;
    name: string;
    type: 'mobile' | 'general' | 'credit' | 'mortgage';
    amount: string;
    currency: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    billingDay: number | null;
    startDate: string;
    endDate: string | null;
    status: 'active' | 'paused' | 'cancelled';
    icon: string;
    color: string;
    isLinked?: boolean;
    linkedEntityId?: string;
    linkedEntityType?: string;
}

interface SubscriptionWithNextBilling extends Subscription {
    nextBillingDate: Date;
    daysUntilBilling: number;
    monthlyEquivalent: number;
}

type GridParams = { w: number; h: number; breakpoint?: string };

export function SubscriptionsWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: subscriptionsData, isLoading } = trpc.subscription.list.useQuery({
        includeLinkedEntities: true,
        status: 'active',
        type: 'all'
    });
    
    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    const processedSubscriptions: SubscriptionWithNextBilling[] = React.useMemo(() => {
        if (!subscriptionsData) return [];
        
        const allSubscriptions = [
            ...subscriptionsData.subscriptions,
            ...subscriptionsData.linkedItems
        ];
        
        return allSubscriptions
            .filter((sub: Subscription) => sub.status === 'active')
            .map((sub: Subscription): SubscriptionWithNextBilling => {
                const amount = Number(sub.amount);
                const monthlyEquivalent = (() => {
                    switch (sub.frequency) {
                        case 'daily': return amount * 30;
                        case 'weekly': return amount * 4.33;
                        case 'yearly': return amount / 12;
                        default: return amount;
                    }
                })();

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const nextBillingDate = new Date(today);
                
                if (sub.frequency === 'monthly') {
                    const billingDay = sub.billingDay || new Date(sub.startDate).getDate();
                    nextBillingDate.setDate(billingDay);
                    if (nextBillingDate < today) {
                        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
                    }
                } else if (sub.frequency === 'weekly') {
                    const dayOfWeek = sub.billingDay || 1;
                    const currentDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
                    const daysUntilBilling = ((dayOfWeek - currentDayOfWeek + 7) % 7) || 7;
                    nextBillingDate.setDate(today.getDate() + daysUntilBilling);
                } else if (sub.frequency === 'daily') {
                    nextBillingDate.setDate(today.getDate() + 1);
                } else if (sub.frequency === 'yearly') {
                    const startDate = new Date(sub.startDate);
                    nextBillingDate.setMonth(startDate.getMonth(), startDate.getDate());
                    if (nextBillingDate < today) {
                        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
                    }
                }

                if (sub.endDate && nextBillingDate > new Date(sub.endDate)) {
                    return null as any;
                }

                const daysUntilBilling = Math.ceil((nextBillingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                return {
                    ...sub,
                    nextBillingDate,
                    daysUntilBilling,
                    monthlyEquivalent
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.daysUntilBilling - b.daysUntilBilling);
    }, [subscriptionsData]);

    const totalsByCurrency: Record<string, number> = React.useMemo(() => {
        const totals: Record<string, number> = {};
        processedSubscriptions.forEach(sub => {
            totals[sub.currency] = (totals[sub.currency] || 0) + sub.monthlyEquivalent;
        });
        return totals;
    }, [processedSubscriptions]);

    const totalSubscriptions = processedSubscriptions.length;
    const visibleSubscriptions = isTall ? processedSubscriptions.slice(0, 4) : processedSubscriptions.slice(0, 2);
    
    const activeBalances = Object.entries(totalsByCurrency).filter(([_, amount]) => amount !== 0);
    const primaryCurrency = activeBalances.length > 0 ? activeBalances[0][0] : 'USD';
    const primaryAmount = activeBalances.length > 0 ? activeBalances[0][1] : 0;

    if (isLoading) {
        return (
            <Card className="dashboard-widget h-full rounded-lg overflow-hidden">
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
        <Card className={cn('dashboard-widget h-full flex flex-col group rounded-lg overflow-hidden', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-lg cursor-pointer">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Subscriptions</div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                                <CurrencyDisplay amount={primaryAmount} currency={primaryCurrency} abbreviate={primaryAmount >= 1000} />
                                <span className="text-[10px] text-muted-foreground font-medium ml-1">/mo</span>
                            </span>
                        </div>
                    </div>
                    <div className="p-1.5 bg-purple-500/10 rounded-sm group-hover:bg-purple-500/20 transition-colors">
                        <Repeat className="h-4 w-4 text-purple-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {visibleSubscriptions.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-center py-4">
                                <p className="text-[10px] text-muted-foreground italic uppercase tracking-wider">No active subscriptions</p>
                            </div>
                        ) : (
                            visibleSubscriptions.map((sub) => (
                                <div key={sub.id} className="flex items-center justify-between gap-2 p-1.5 rounded-sm bg-muted/40 hover:bg-muted/60 transition-colors group/item">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-sm flex-shrink-0" style={{ color: sub.color }}>{sub.icon}</span>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-bold truncate leading-tight">{sub.name}</span>
                                            <span className={cn(
                                                "text-[9px] font-medium uppercase",
                                                sub.daysUntilBilling <= 3 ? "text-rose-500 font-bold" : "text-muted-foreground"
                                            )}>
                                                {sub.daysUntilBilling === 0 ? 'Today' : sub.daysUntilBilling === 1 ? 'Tomorrow' : `In ${sub.daysUntilBilling} days`}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold">
                                            <CurrencyDisplay amount={Number(sub.amount)} currency={sub.currency} abbreviate />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>

            <WidgetFooter to="/subscriptions">
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Bell className="h-2.5 w-2.5" />
                    {totalSubscriptions} Active
                </span>
                <div className="text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Details <ArrowRight className="h-2.5 w-2.5" />
                </div>
            </WidgetFooter>
        </Card>
    );
}
