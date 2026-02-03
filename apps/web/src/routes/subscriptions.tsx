import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Plus,
    Calendar as CalendarIcon,
    Clock,
    ChevronLeft,
    ChevronRight,
    Wallet,
    CheckCircle2,
    Circle,
    Info
} from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AddSubscriptionSheet } from '@/components/AddSubscriptionSheet';
import { SubscriptionPaymentSheet } from '@/components/SubscriptionPaymentSheet';

import { getPaymentStatusOptions, getTargetMonthStr, isPaidForTargetMonth } from "@/lib/payment-status";

export const Route = (createFileRoute as any)('/subscriptions')({
    component: SubscriptionsPage,
});

interface Subscription {
    id: string;
    name: string;
    type: 'mobile' | 'general' | 'credit' | 'mortgage';
    amount: string;
    currency: string;
    frequency: string;
    billingDay: number | null;
    startDate: string;
    endDate: string | null;
    status: string;
    icon: string;
    color: string;
    isLinked?: boolean;
    linkedEntityId?: string;
    linkedEntityType?: string;
    payments?: Array<{
        id: string;
        amount: string;
        paidAt: string;
        monthYear?: string; // For mortgages
        currencyBalance?: {
            account?: { name: string };
        };
    }>;
}

interface UpcomingItem {
    subscription: Subscription;
    dueDate: string;
    isPaid: boolean;
}

export function SubscriptionsPage() {
    const [view, setView] = useState<'timeline' | 'calendar'>('timeline');
    const [showAddSubscription, setShowAddSubscription] = useState(false);
    const { data: settings } = trpc.settings.getUserSettings.useQuery();

    const [payingSubscription, setPayingSubscription] = useState<Subscription | null>(null);
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

    const { data: subscriptionsData, isLoading: isLoadingSubscriptions } = trpc.subscription.list.useQuery({
        includeLinkedEntities: true
    });
    const { data: upcomingData, isLoading: isLoadingUpcoming } = trpc.subscription.getUpcoming.useQuery({ days: 30 });
    const { data: calendarData, isLoading: isLoadingCalendar } = trpc.subscription.getCalendarView.useQuery({
        year: calendarYear,
        month: calendarMonth
    });

    const utils = trpc.useUtils();

    const allItems = useMemo(() => {
        if (!subscriptionsData) return [];
        return [
            ...subscriptionsData.subscriptions,
            ...subscriptionsData.linkedItems
        ];
    }, [subscriptionsData]);

    const totalMonthlyByCurrency = useMemo(() => {
        const currencyTotals: Record<string, number> = {};
        allItems
            .filter((s: Subscription) => s.status === 'active')
            .forEach((s: Subscription) => {
                const amount = Number(s.amount);
                const monthlyAmount = (() => {
                    switch (s.frequency) {
                        case 'daily': return amount * 30;
                        case 'weekly': return amount * 4;
                        case 'yearly': return amount / 12;
                        default: return amount;
                    }
                })();
                const currency = s.currency || 'USD';
                currencyTotals[currency] = (currencyTotals[currency] || 0) + monthlyAmount;
            });
        return currencyTotals;
    }, [allItems]);

    const activeCount = allItems.filter((s: Subscription) => s.status === 'active').length;
    const upcomingThisWeek = (upcomingData || []).filter((u: UpcomingItem) => {
        const dueDate = new Date(u.dueDate);
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return dueDate <= weekFromNow && !u.isPaid;
    }).length;

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'mobile': return 'bg-blue-500/20 text-blue-500';
            case 'credit': return 'bg-red-500/20 text-red-500';
            case 'mortgage': return 'bg-green-500/20 text-green-500';
            default: return 'bg-purple-500/20 text-purple-500';
        }
    };

    const formatCurrency = (amount: string | number, currency: string = 'USD') => {
        return Number(amount).toLocaleString('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    };

    const navigateCalendar = (direction: 'prev' | 'next') => {
        if (direction === 'prev') {
            if (calendarMonth === 1) {
                setCalendarMonth(12);
                setCalendarYear(y => y - 1);
            } else {
                setCalendarMonth(m => m - 1);
            }
        } else {
            if (calendarMonth === 12) {
                setCalendarMonth(1);
                setCalendarYear(y => y + 1);
            } else {
                setCalendarMonth(m => m + 1);
            }
        }
    };

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Get current month for payment status
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const currentDate = new Date();

    if (isLoadingSubscriptions) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">Subscriptions</h1>
                    <p className="text-sm md:text-base text-muted-foreground">Manage your recurring payments</p>
                </div>
                <Button onClick={() => setShowAddSubscription(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Subscription
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Monthly</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {Object.entries(totalMonthlyByCurrency).length === 0 ? (
                                <div className="text-sm text-muted-foreground">No active subscriptions</div>
                            ) : (
                                Object.entries(totalMonthlyByCurrency)
                                    .sort((a, b) => a[0].localeCompare(b[0]))
                                    .map(([currency, amount]) => (
                                        <div key={currency} className="text-xl font-bold">
                                            {formatCurrency(amount, currency)}
                                        </div>
                                    ))
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Active Subscriptions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Due This Week</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-500">{upcomingThisWeek}</div>
                    </CardContent>
                </Card>
            </div>

            {/* View Toggle */}
            <Tabs value={view} onValueChange={(v) => setView(v as 'timeline' | 'calendar')}>
                <TabsList className="grid w-full max-w-[400px] grid-cols-2 mx-auto md:ml-0">
                    <TabsTrigger value="timeline" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Timeline
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Calendar
                    </TabsTrigger>
                </TabsList>

                {/* Timeline View */}
                <TabsContent value="timeline" className="mt-4">
                    {!upcomingData || upcomingData.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold">No upcoming payments</h3>
                                <p className="text-muted-foreground mb-4">Add subscriptions to see your payment timeline</p>
                                <Button onClick={() => setShowAddSubscription(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Subscription
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

                            <div className="space-y-4">
                                {upcomingData.map((item: UpcomingItem, index: number) => (
                                    <div key={`${item.subscription.id}-${index}`} className="relative pl-10">
                                        {/* Timeline dot */}
                                        <div
                                            className={`absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${item.isPaid
                                                ? 'bg-green-500 border-green-500'
                                                : 'bg-background border-border'
                                                }`}
                                            style={{
                                                backgroundColor: item.isPaid ? undefined : item.subscription.color,
                                                borderColor: item.subscription.color
                                            }}
                                        >
                                            {item.isPaid && <CheckCircle2 className="h-3 w-3 text-white" />}
                                        </div>

                                        <Card className="hover:shadow-md transition-shadow">
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl">{item.subscription.icon}</span>
                                                        <div>
                                                            <h4 className="font-semibold">{item.subscription.name}</h4>
                                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                <Badge variant="secondary" className={getTypeColor(item.subscription.type)}>
                                                                    {item.subscription.type}
                                                                </Badge>
                                                                <span>
                                                                    Due: {new Date(item.dueDate).toLocaleDateString('en-US', {
                                                                        weekday: 'short',
                                                                        month: 'short',
                                                                        day: 'numeric'
                                                                    })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <p className="font-semibold">
                                                                {formatCurrency(item.subscription.amount, item.subscription.currency)}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">{item.subscription.frequency}</p>
                                                        </div>
                                                        {!item.isPaid && !item.subscription.isLinked && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => setPayingSubscription(item.subscription)}
                                                            >
                                                                <Wallet className="h-4 w-4 mr-1" />
                                                                Pay
                                                            </Button>
                                                        )}
                                                        <Badge
                                                            variant={item.isPaid ? "secondary" : "destructive"}
                                                            className={item.isPaid ? "bg-green-500/20 text-green-600 flex items-center gap-1" : "flex items-center gap-1"}
                                                        >
                                                            {item.isPaid ? (
                                                                <><CheckCircle2 className="h-3 w-3" /> Paid</>
                                                            ) : (
                                                                <><Circle className="h-3 w-3" /> Due</>
                                                            )}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* Calendar View */}
                <TabsContent value="calendar" className="mt-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <Button variant="ghost" size="icon" onClick={() => navigateCalendar('prev')}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <CardTitle className="text-lg">
                                    {monthNames[calendarMonth - 1]} {calendarYear}
                                </CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => navigateCalendar('next')}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingCalendar ? (
                                <div className="h-64 flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-7 gap-1">
                                    {/* Day headers */}
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                        <div key={day} className="text-center text-xs font-medium text-muted-foreground p-2">
                                            {day}
                                        </div>
                                    ))}

                                    {/* Empty cells for days before the 1st */}
                                    {Array.from({ length: new Date(calendarYear, calendarMonth - 1, 1).getDay() }).map((_, i) => (
                                        <div key={`empty-${i}`} className="aspect-square" />
                                    ))}

                                    {/* Calendar days */}
                                    {Array.from({ length: calendarData?.daysInMonth || 31 }).map((_, i) => {
                                        const day = i + 1;
                                        const dayData = calendarData?.data[day] || [];
                                        const isToday = new Date().getDate() === day &&
                                            new Date().getMonth() + 1 === calendarMonth &&
                                            new Date().getFullYear() === calendarYear;

                                        return (
                                            <div
                                                key={day}
                                                className={`aspect-square p-1 border rounded-lg ${isToday ? 'border-primary bg-primary/5' : 'border-transparent hover:border-muted'
                                                    }`}
                                            >
                                                <div className="text-xs font-medium mb-1">{day}</div>
                                                <div className="space-y-0.5">
                                                    {dayData.slice(0, 3).map((item: any, idx: number) => (
                                                        <Popover key={idx}>
                                                            <PopoverTrigger asChild>
                                                                <div
                                                                    className="text-[10px] px-1 py-0.5 rounded truncate flex items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                                                                    style={{
                                                                        backgroundColor: `${item.subscription.color}20`,
                                                                        color: item.subscription.color
                                                                    }}
                                                                >
                                                                    {item.isPaid ? (
                                                                        <CheckCircle2 className="h-2 w-2 shrink-0" />
                                                                    ) : (
                                                                        <Circle className="h-2 w-2 shrink-0" />
                                                                    )}
                                                                    <span className="truncate">{item.subscription.name}</span>
                                                                </div>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-80">
                                                                <div className="space-y-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div
                                                                            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                                                                            style={{ backgroundColor: `${item.subscription.color}20` }}
                                                                        >
                                                                            {item.subscription.icon}
                                                                        </div>
                                                                        <div>
                                                                            <h4 className="font-semibold">{item.subscription.name}</h4>
                                                                            <Badge variant="secondary" className={getTypeColor(item.subscription.type)}>
                                                                                {item.subscription.type}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div>
                                                                            <p className="text-xs text-muted-foreground">Amount</p>
                                                                            <p className="font-semibold">
                                                                                {formatCurrency(item.subscription.amount, item.subscription.currency)}
                                                                            </p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs text-muted-foreground">Status</p>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <Badge
                                                                                    variant={item.isPaid ? "secondary" : "destructive"}
                                                                                    className={item.isPaid ? "bg-green-500/20 text-green-600 h-5 px-1.5" : "h-5 px-1.5"}
                                                                                >
                                                                                    {item.isPaid ? "Paid" : "Due"}
                                                                                </Badge>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                                                                        <span>{item.subscription.frequency}</span>
                                                                        <span>Due: {day} {monthNames[calendarMonth - 1]}</span>
                                                                    </div>

                                                                    {!item.isPaid && !item.subscription.isLinked && item.subscription.status === 'active' && (
                                                                        <Button
                                                                            className="w-full"
                                                                            size="sm"
                                                                            onClick={() => setPayingSubscription(item.subscription)}
                                                                        >
                                                                            <Wallet className="h-4 w-4 mr-2" />
                                                                            Pay Now
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    ))}
                                                    {dayData.length > 3 && (
                                                        <div className="text-[10px] text-muted-foreground">
                                                            +{dayData.length - 3} more
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* All Subscriptions List */}
            <Card>
                <CardHeader>
                    <CardTitle>All Subscriptions</CardTitle>
                    <CardDescription>View and manage all your recurring payments</CardDescription>
                </CardHeader>
                <CardContent>
                    {allItems.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No subscriptions yet</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {allItems.map((sub: Subscription) => {
                                // Check if paid based on settings logic
                                const settingsType = sub.type === 'credit'
                                    ? 'credit'
                                    : sub.type === 'mortgage'
                                        ? 'mortgage'
                                        : 'subscription';
                                const { logic, period } = getPaymentStatusOptions(settings, settingsType);
                                const targetMonthStr = getTargetMonthStr(sub.billingDay, { logic, period });
                                const isPaidThisMonth = isPaidForTargetMonth(sub.payments as any, targetMonthStr, sub.type === 'mortgage');

                                return (
                                    <Card key={sub.id} className="relative overflow-hidden hover:shadow-md transition-shadow">
                                        <div
                                            className="absolute top-0 left-0 right-0 h-1"
                                            style={{ backgroundColor: sub.color }}
                                        />
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl">{sub.icon}</span>
                                                    <div>
                                                        <h4 className="font-semibold">{sub.name}</h4>
                                                        <Badge variant="secondary" className={getTypeColor(sub.type)}>
                                                            {sub.type}
                                                            {sub.isLinked && ' (linked)'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                                                        {sub.status}
                                                    </Badge>
                                                    {sub.status === 'active' && (
                                                        <Badge
                                                            variant={isPaidThisMonth ? "secondary" : "destructive"}
                                                            className={isPaidThisMonth ? "bg-green-500/20 text-green-500 flex items-center gap-1 text-[10px] h-5" : "flex items-center gap-1 text-[10px] h-5"}
                                                        >
                                                            {isPaidThisMonth ? (
                                                                <><CheckCircle2 className="h-3 w-3" /> Paid</>
                                                            ) : (
                                                                <><Circle className="h-3 w-3" /> Unpaid</>
                                                            )}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">{sub.frequency}</span>
                                                <span className="font-semibold">
                                                    {formatCurrency(sub.amount, sub.currency)}
                                                </span>
                                            </div>
                                            {!sub.isLinked && sub.status === 'active' && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-full mt-3"
                                                    onClick={() => setPayingSubscription(sub)}
                                                >
                                                    <Wallet className="h-4 w-4 mr-2" />
                                                    Make Payment
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Sheets */}
            <AddSubscriptionSheet
                open={showAddSubscription}
                onOpenChange={setShowAddSubscription}
            />
            <SubscriptionPaymentSheet
                open={!!payingSubscription}
                onOpenChange={(open) => !open && setPayingSubscription(null)}
                subscription={payingSubscription}
            />
        </div >
    );
}
