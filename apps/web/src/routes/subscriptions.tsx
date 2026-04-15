import { useState, useMemo } from 'react';
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
    Circle
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ui/action-button';
import { AddSubscriptionSheet } from '@/components/AddSubscriptionSheet';
import { SubscriptionPaymentSheet } from '@/components/SubscriptionPaymentSheet';

import { getPaymentStatusOptions, getTargetMonthStr, isPaidForTargetMonth } from "@/lib/payment-status";

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
    const [selectedDaySubscriptions, setSelectedDaySubscriptions] = useState<{ day: number, items: { subscription: Subscription; isPaid: boolean }[] } | null>(null);
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

    const { data: subscriptionsData, isLoading: isLoadingSubscriptions } = trpc.subscription.list.useQuery({
        includeLinkedEntities: true
    });
    const { data: upcomingData } = trpc.subscription.getUpcoming.useQuery({ days: 30 });
    const { data: calendarData, isLoading: isLoadingCalendar } = trpc.subscription.getCalendarView.useQuery({
        year: calendarYear,
        month: calendarMonth
    });


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


    if (isLoadingSubscriptions) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-muted animate-pulse rounded-md" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <div className="h-28 bg-muted animate-pulse rounded-lg sm:col-span-2 lg:col-span-2" />
                    <div className="h-28 bg-muted animate-pulse rounded-lg" />
                    <div className="h-28 bg-muted animate-pulse rounded-lg" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                title="Subscriptions"
                subtitle="Manage your recurring payments"
                variant="one"
            >
                <ActionButton onClick={() => setShowAddSubscription(true)} className="sm:flex-none">
                    <Plus className="h-4 w-4" />
                    Add
                </ActionButton>
            </PageHeader>

            {/* Summary Cards */}
            <div className="flex flex-row gap-3 md:gap-4 overflow-x-auto pb-2 -mx-2 px-2 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
                <Card className="flex-1 min-w-[200px]">
                    <CardHeader className="pb-1 px-3 md:px-6 pt-3 md:pt-6">
                        <CardDescription className="text-xs md:text-sm">Total Monthly</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
                        <div className="space-y-1">
                            {Object.entries(totalMonthlyByCurrency).length === 0 ? (
                                <div className="text-xs md:text-sm text-muted-foreground">None</div>
                            ) : (
                                Object.entries(totalMonthlyByCurrency)
                                    .sort((a, b) => a[0].localeCompare(b[0]))
                                    .map(([currency, amount]) => (
                                        <div key={currency} className="text-lg md:text-2xl font-bold truncate">
                                            {formatCurrency(amount, currency)}
                                        </div>
                                    ))
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card className="flex-none min-w-[90px] w-[20%] max-w-[140px]">
                    <CardHeader className="pb-1 px-3 md:px-6 pt-3 md:pt-6">
                        <CardDescription className="text-xs md:text-sm">Active</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
                        <div className="text-xl md:text-3xl font-bold">{activeCount}</div>
                    </CardContent>
                </Card>
                <Card className="flex-none min-w-[100px] w-[25%] max-w-[150px]">
                    <CardHeader className="pb-1 px-3 md:px-6 pt-3 md:pt-6">
                        <CardDescription className="text-xs md:text-sm whitespace-nowrap">This Week</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
                        <div className="text-xl md:text-3xl font-bold text-orange-500">{upcomingThisWeek}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-12 max-[1200px]:gap-4 mt-6">
                {/* Left Column: Timeline / Calendar */}
                <div className="lg:col-span-6 xl:col-span-6 flex flex-col min-w-0">
                    <Tabs value={view} onValueChange={(v) => setView(v as 'timeline' | 'calendar')} className="w-full">
                        <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto rounded-lg">
                            <TabsTrigger value="timeline" className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Timeline
                            </TabsTrigger>
                            <TabsTrigger value="calendar" className="flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4 dark:text-white" />
                                <span className="dark:text-white">Calendar</span>
                            </TabsTrigger>
                        </TabsList>

                        {/* Timeline View */}
                        <TabsContent value="timeline" className="mt-6">
                    {!upcomingData || upcomingData.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold">No upcoming payments</h3>
                                <p className="text-muted-foreground mb-4">Add subscriptions to see your payment timeline</p>
                                <Button onClick={() => setShowAddSubscription(true)} className="rounded-toolbar gap-2">
                                    <Plus className="h-4 w-4" />
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
                                            <CardContent className="p-4 px-3 sm:px-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                                        <div className="flex flex-col items-center flex-shrink-0 min-w-[32px] sm:min-w-[40px]">
                                                            <span className="text-xl sm:text-2xl">{item.subscription.icon}</span>
                                                            <Badge variant="secondary" className={`sm:hidden mt-0.5 text-[8px] h-3.5 px-1 uppercase tracking-tighter ${getTypeColor(item.subscription.type)}`}>
                                                                {item.subscription.type === 'mobile' ? 'mob' : item.subscription.type.slice(0, 4)}
                                                            </Badge>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="font-semibold text-sm sm:text-base truncate">{item.subscription.name}</h4>
                                                            <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-2 text-[11px] sm:text-sm text-muted-foreground">
                                                                <Badge variant="secondary" className={`hidden sm:inline-flex ${getTypeColor(item.subscription.type)}`}>
                                                                    {item.subscription.type}
                                                                </Badge>
                                                                <span className="truncate">
                                                                    Due: {new Date(item.dueDate).toLocaleDateString('en-US', {
                                                                        weekday: 'short',
                                                                        month: 'short',
                                                                        day: 'numeric'
                                                                    })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                                                        <div className="flex items-center gap-2 sm:gap-3">
                                                            {!item.isPaid && !item.subscription.isLinked && (
                                                                <ActionButton
                                                                    onClick={() => setPayingSubscription(item.subscription)}
                                                                >
                                                                    <Wallet className="h-3.5 w-3.5 mr-1" />
                                                                    Pay
                                                                </ActionButton>
                                                            )}
                                                            <div className="text-right min-w-[70px] sm:min-w-[90px]">
                                                                <p className="font-semibold text-sm sm:text-base whitespace-nowrap">
                                                                    {formatCurrency(item.subscription.amount, item.subscription.currency)}
                                                                </p>
                                                                <p className="text-[10px] sm:text-xs text-muted-foreground">{item.subscription.frequency}</p>
                                                            </div>
                                                        </div>
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
                                                className={`aspect-square border rounded-lg cursor-pointer transition-all flex flex-col ${isToday ? 'border-primary bg-primary/5 shadow-inner' : 'border-transparent hover:border-muted hover:bg-muted/10'
                                                    }`}
                                                onClick={() => setSelectedDaySubscriptions({ day, items: dayData })}
                                            >
                                                <div className="pt-2 pl-2 pb-1">
                                                    <span className={cn(
                                                        "text-[10px] sm:text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full",
                                                        isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground/80"
                                                    )}>
                                                        {day}
                                                    </span>
                                                </div>
                                                <div className="px-1.5 pb-1 space-y-0.5 mt-auto">
                                                    {dayData.slice(0, 3).map((item: { subscription: Subscription; isPaid: boolean }, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            className="text-[9px] sm:text-[10px] px-1 py-0.5 rounded-md truncate flex items-center gap-1 transition-all"
                                                            style={{
                                                                backgroundColor: `${item.subscription.color}15`,
                                                                color: item.subscription.color,
                                                                borderLeft: `2px solid ${item.subscription.color}`
                                                            }}
                                                        >
                                                            <span className="truncate font-medium">{item.subscription.name}</span>
                                                        </div>
                                                    ))}
                                                    {dayData.length > 3 && (
                                                        <div className="text-[8px] sm:text-[9px] text-muted-foreground font-medium pl-1">
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
                </div>

                {/* Right Column: All Subscriptions List */}
                <div className="lg:col-span-4 xl:col-span-4 min-w-0 space-y-6 mt-4 lg:mt-0">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b pb-4 lg:pt-[2px]">
                        <div>
                            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                                All Subscriptions
                            </h2>
                        </div>
                    </div>

                    {allItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center gap-4 rounded-xl border border-dashed bg-muted/30">
                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                                <Wallet className="h-8 w-8 text-muted-foreground/60" />
                            </div>
                            <div>
                                <p className="font-medium text-lg">No active subscriptions</p>
                                <p className="text-muted-foreground text-sm max-w-[250px] mx-auto mt-1">
                                    Keep track of your recurring expenses by adding them here.
                                </p>
                            </div>
                            <Button
                                onClick={() => setShowAddSubscription(true)}
                                className="rounded-full gap-2 mt-4 px-6 shadow-sm hover:shadow transition-all"
                            >
                                <Plus className="h-4 w-4" />
                                Add Your First Subscription
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {allItems.map((sub: Subscription) => {
                                // Check if paid based on settings logic
                                const settingsType = sub.type === 'credit'
                                    ? 'credit'
                                    : sub.type === 'mortgage'
                                        ? 'mortgage'
                                        : 'subscription';
                                const { logic, period } = getPaymentStatusOptions(settings, settingsType);
                                const targetMonthStr = getTargetMonthStr(sub.billingDay, { logic, period });
                                const isPaidThisMonth = isPaidForTargetMonth(sub.payments || [], targetMonthStr, sub.type === 'mortgage');

                                return (
                                    <div 
                                        key={sub.id} 
                                        className="group relative flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm transition-all hover:bg-accent/10 cursor-pointer"
                                        onClick={() => setPayingSubscription(sub)}
                                    >
                                        <div className="flex items-center gap-4 max-[1200px]:gap-2 min-w-0">
                                            <div 
                                                className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-xl shadow-sm border border-border/50"
                                                style={{ backgroundColor: `${sub.color}15` }}
                                            >
                                                {sub.icon}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-semibold text-sm leading-tight truncate">{sub.name}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <Badge variant="outline" className={`border-transparent font-medium ${getTypeColor(sub.type)} px-1 py-0 text-[9px] h-3.5 uppercase tracking-wider`}>
                                                        {sub.type}
                                                    </Badge>
                                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                                        {sub.frequency}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 max-[1200px]:gap-0 shrink-0">
                                            {sub.status === 'active' ? (
                                                <div className="relative flex h-5 w-5 items-center justify-center">
                                                    <div className={cn(
                                                        "w-2.5 h-2.5 rounded-full",
                                                        isPaidThisMonth 
                                                            ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" 
                                                            : "bg-destructive animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                                                    )} />
                                                </div>
                                            ) : (
                                                <Badge variant="secondary" className="uppercase text-[9px] tracking-wider font-semibold py-0 h-4">
                                                    {sub.status}
                                                </Badge>
                                            )}

                                            <div className="text-right min-w-[80px]">
                                                <p className="text-sm font-bold tracking-tight">
                                                    {formatCurrency(sub.amount, sub.currency)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Sheets */}
            <AddSubscriptionSheet
                open={showAddSubscription}
                onOpenChange={setShowAddSubscription}
            />

            <Dialog open={!!selectedDaySubscriptions} onOpenChange={(open) => !open && setSelectedDaySubscriptions(null)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>
                            Payments for {selectedDaySubscriptions?.day} {monthNames[calendarMonth - 1]} {calendarYear}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        {selectedDaySubscriptions?.items.map((item, idx) => {
                            const sub = item.subscription;

                            // Calculate progress for credits
                            let progressText = null;
                            if (sub.isLinked && sub.type === 'credit' && sub.startDate && sub.endDate) {
                                const allMonthYears = getMonthsBetween(sub.startDate, sub.endDate);
                                const total = allMonthYears.length;

                                // Find which payment number this month is
                                const currentMonthYear = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}`;
                                const paymentIndex = allMonthYears.indexOf(currentMonthYear) + 1;

                                if (paymentIndex > 0) {
                                    progressText = `Payment ${paymentIndex} of ${total}`;
                                }
                            }

                            return (
                                <div key={idx} className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                                                style={{ backgroundColor: `${sub.color}20` }}
                                            >
                                                {sub.icon}
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-sm">{sub.name}</h4>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="secondary" className={cn("text-[10px] h-4 px-1", getTypeColor(sub.type))}>
                                                        {sub.type}
                                                    </Badge>
                                                    {progressText && (
                                                        <span className="text-[10px] text-muted-foreground font-medium">
                                                            {progressText}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-sm">
                                                {formatCurrency(sub.amount, sub.currency)}
                                            </p>
                                            <Badge
                                                variant={item.isPaid ? "secondary" : "destructive"}
                                                className={cn(
                                                    "text-[10px] h-4 px-1",
                                                    item.isPaid ? "bg-green-500/20 text-green-600 hover:bg-green-500/30" : ""
                                                )}
                                            >
                                                {item.isPaid ? "Paid" : "Due"}
                                            </Badge>
                                        </div>
                                    </div>

                                    {!item.isPaid && !sub.isLinked && sub.status === 'active' && (
                                        <Button
                                            className="w-full h-8 text-xs mt-1 rounded-toolbar"
                                            onClick={() => {
                                                setPayingSubscription(sub);
                                                setSelectedDaySubscriptions(null);
                                            }}
                                        >
                                            <Wallet className="h-3.5 w-3.5 mr-2" />
                                            Pay Now
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            <SubscriptionPaymentSheet
                open={!!payingSubscription}
                onOpenChange={(open) => !open && setPayingSubscription(null)}
                subscription={payingSubscription}
            />
        </div >
    );
}

// Helper to generate all months between two dates
function getMonthsBetween(startDateStr: string, endDateStr: string): string[] {
    const months: string[] = [];
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    // Adjust to first of month for comparison
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endMonth) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        months.push(`${year}-${month}`);
        current.setMonth(current.getMonth() + 1);
    }

    return months;
}
