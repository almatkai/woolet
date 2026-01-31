import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Repeat } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

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

export function SubscriptionsWidget({ gridParams }: { gridParams?: { w: number; h: number } }) {
    const { data: subscriptionsData, isLoading } = trpc.subscription.list.useQuery({
        includeLinkedEntities: true,
        status: 'active',
        type: 'all'
    });
    
    const isCompact = (gridParams?.h ?? 0) <= 1;
    const isTall = (gridParams?.h ?? 0) > 1;

    // Process subscriptions and calculate next billing dates
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
                
                // Calculate monthly equivalent based on frequency
                const monthlyEquivalent = (() => {
                    switch (sub.frequency) {
                        case 'daily': return amount * 30;
                        case 'weekly': return amount * 4.33; // More accurate weekly calculation
                        case 'yearly': return amount / 12;
                        default: return amount;
                    }
                })();

                // Calculate next billing date
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                let nextBillingDate = new Date(today);
                
                if (sub.frequency === 'monthly') {
                    const billingDay = sub.billingDay || new Date(sub.startDate).getDate();
                    nextBillingDate.setDate(billingDay);
                    
                    // If billing day already passed this month, move to next month
                    if (nextBillingDate < today) {
                        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
                    }
                } else if (sub.frequency === 'weekly') {
                    const dayOfWeek = sub.billingDay || 1; // 1 = Monday
                    const currentDayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // Convert to 1-7 (Mon-Sun)
                    const daysUntilBilling = ((dayOfWeek - currentDayOfWeek + 7) % 7) || 7;
                    nextBillingDate.setDate(today.getDate() + daysUntilBilling);
                } else if (sub.frequency === 'daily') {
                    nextBillingDate.setDate(today.getDate() + 1);
                } else if (sub.frequency === 'yearly') {
                    const startDate = new Date(sub.startDate);
                    nextBillingDate.setMonth(startDate.getMonth(), startDate.getDate());
                    
                    // If anniversary already passed this year, move to next year
                    if (nextBillingDate < today) {
                        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
                    }
                }

                // Check if subscription has ended
                if (sub.endDate && nextBillingDate > new Date(sub.endDate)) {
                    // Don't include expired subscriptions
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

    // Calculate totals by currency
    const totalsByCurrency: Record<string, number> = React.useMemo(() => {
        const totals: Record<string, number> = {};
        processedSubscriptions.forEach(sub => {
            totals[sub.currency] = (totals[sub.currency] || 0) + sub.monthlyEquivalent;
        });
        return totals;
    }, [processedSubscriptions]);

    const totalSubscriptions = processedSubscriptions.length;
    const visibleSubscriptions = isTall ? processedSubscriptions.slice(0, 5) : [];
    
    // Get primary display value
    const activeBalances = Object.entries(totalsByCurrency).filter(([_, amount]) => amount !== 0);
    const primaryCurrency = activeBalances.length > 0 ? activeBalances[0][0] : 'USD';
    const primaryAmount = activeBalances.length > 0 ? activeBalances[0][1] : 0;

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                    <Skeleton className="h-4 w-28" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-8 w-32" />
                </CardContent>
            </Card>
        );
    }

    // Compact view - just show total
    if (isCompact) {
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <CardTitle className="dashboard-widget__title truncate text-sm">Subscriptions</CardTitle>
                    <Repeat className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="p-2 pt-0">
                    <div className="dashboard-widget__value">
                        <CurrencyDisplay amount={primaryAmount} currency={primaryCurrency} abbreviate />
                    </div>
                    <p className="dashboard-widget__sub mt-0.5 truncate">
                        {totalSubscriptions} {totalSubscriptions === 1 ? 'subscription' : 'subscriptions'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Expanded view with subscription list
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                <CardTitle className="dashboard-widget__title truncate text-sm">Subscriptions</CardTitle>
                <Repeat className="dashboard-widget__icon" />
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col">
                <div className="dashboard-widget__value mb-2">
                    <CurrencyDisplay amount={primaryAmount} currency={primaryCurrency} abbreviate />
                    <span className="text-xs text-muted-foreground ml-2">/ month</span>
                </div>
                
                {isTall && processedSubscriptions.length > 0 && (
                    <ScrollArea className="flex-1 -mx-1 px-1">
                        <div className="space-y-1.5">
                            {visibleSubscriptions.map(subscription => (
                                <div 
                                    key={subscription.id} 
                                    className="dashboard-widget__item flex items-center justify-between p-1.5 rounded bg-muted/30"
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span 
                                            className="text-xs flex-shrink-0" 
                                            style={{ color: subscription.color }}
                                        >
                                            {subscription.icon}
                                        </span>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-medium truncate">{subscription.name}</span>
                                            <span className="text-[10px] text-muted-foreground truncate">
                                                {subscription.daysUntilBilling === 0 
                                                    ? 'Today' 
                                                    : subscription.daysUntilBilling === 1
                                                        ? 'Tomorrow'
                                                        : `In ${subscription.daysUntilBilling} days`
                                                }
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-xs font-medium whitespace-nowrap ml-2">
                                        <CurrencyDisplay 
                                            amount={subscription.monthlyEquivalent} 
                                            currency={subscription.currency}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
                
                <p className="dashboard-widget__sub mt-auto pt-1">
                    {totalSubscriptions > visibleSubscriptions.length
                        ? `Showing ${visibleSubscriptions.length} of ${totalSubscriptions} subscriptions`
                        : `${totalSubscriptions} ${totalSubscriptions === 1 ? 'subscription' : 'subscriptions'}`}
                </p>
            </CardContent>
        </Card>
    );
}