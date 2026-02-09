import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Bell, Check, ExternalLink, AlertCircle, CalendarClock, CreditCard, TrendingUp, Wallet, DollarSign, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export const Route = (createFileRoute as (path: string) => any)('/notifications')({
    component: NotificationsPage,
});

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    priority: string;
    links?: {
        web?: string;
        mobile?: string;
        universal?: string;
    };
    entityType?: string;
    entityId?: string;
    isRead: boolean;
    actionTaken: boolean;
    createdAt: string;
}

const priorityColors = {
    low: 'bg-blue-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    urgent: 'bg-red-500',
};

const priorityBadgeColors = {
    low: 'bg-blue-500/10 text-blue-500',
    medium: 'bg-yellow-500/10 text-yellow-500',
    high: 'bg-orange-500/10 text-orange-500',
    urgent: 'bg-red-500/10 text-red-500',
};

const typeIcons = {
    subscription_due: CalendarClock,
    subscription_overdue: AlertCircle,
    subscription_paid: Check,
    payment_reminder: DollarSign,
    budget_alert: Wallet,
    spending_anomaly: AlertCircle,
    investment_update: TrendingUp,
    credit_limit: CreditCard,
    debt_reminder: CreditCard,
    general: Bell,
};

export function NotificationsPage() {
    const [activeTab, setActiveTab] = useState<string>('all');

    const { data: notificationsData, refetch } = trpc.notification.list.useQuery(
        { limit: 50 },
        { refetchInterval: 30000 }
    );

    const markAsReadMutation = trpc.notification.markAsRead.useMutation({
        onSuccess: () => refetch(),
    });

    const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
        onSuccess: () => refetch(),
    });

    const deleteMutation = trpc.notification.delete.useMutation({
        onSuccess: () => refetch(),
    });

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    };

    const notifications = notificationsData?.notifications || [];
    const unreadCount = notificationsData?.unreadCount || 0;

    const filteredNotifications = notifications.filter((n: Notification) => {
        if (activeTab === 'unread') return !n.isRead;
        if (activeTab === 'read') return n.isRead;
        return true;
    });

    if (notificationsData === undefined) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                <div className="grid gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Notifications</h1>
                    <p className="hidden sm:block text-sm md:text-base text-muted-foreground">
                        {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <Button onClick={() => markAllAsReadMutation.mutate()}>
                        <Check className="h-4 w-4 mr-2" />
                        Mark all as read
                    </Button>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full max-w-[400px] grid-cols-3">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="unread">
                        Unread
                        {unreadCount > 0 && (
                            <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                                {unreadCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="read">Read</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-4">
                    {filteredNotifications.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold">No notifications</h3>
                                <p className="text-muted-foreground">
                                    {activeTab === 'unread'
                                        ? 'You have no unread notifications'
                                        : 'You have no notifications yet'}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {filteredNotifications.map((notification: Notification) => {
                                const Icon = typeIcons[notification.type as keyof typeof typeIcons] || Bell;
                                const isUnread = !notification.isRead;

                                return (
                                    <Card
                                        key={notification.id}
                                        className={cn(
                                            "relative overflow-hidden transition-all hover:shadow-md",
                                            isUnread && "border-primary/30"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "absolute left-0 top-0 bottom-0 w-1",
                                                priorityColors[notification.priority as keyof typeof priorityColors] || 'bg-muted'
                                            )}
                                        />
                                        <CardContent className="p-4 pl-5">
                                            <div className="flex items-start gap-4">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                                                    priorityColors[notification.priority as keyof typeof priorityColors] || 'bg-muted'
                                                )}>
                                                    <Icon className="h-5 w-5 text-white" />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className={cn(
                                                                "font-semibold",
                                                                isUnread ? "text-foreground" : "text-muted-foreground"
                                                            )}>
                                                                {notification.title}
                                                            </h4>
                                                            <Badge
                                                                variant="secondary"
                                                                className={priorityBadgeColors[notification.priority as keyof typeof priorityBadgeColors]}
                                                            >
                                                                {notification.priority}
                                                            </Badge>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground shrink-0">
                                                            {formatTimeAgo(notification.createdAt)}
                                                        </span>
                                                    </div>

                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {notification.message}
                                                    </p>

                                                    <div className="flex items-center gap-2 mt-3">
                                                        {!notification.isRead && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => markAsReadMutation.mutate({ id: notification.id })}
                                                            >
                                                                <Check className="h-3 w-3 mr-1" />
                                                                Mark as read
                                                            </Button>
                                                        )}

                                                        {notification.links?.web && (
                                                            <a href={notification.links.web}>
                                                                <Button variant="ghost" size="sm">
                                                                    <ExternalLink className="h-3 w-3 mr-1" />
                                                                    View details
                                                                </Button>
                                                            </a>
                                                        )}

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-muted-foreground hover:text-destructive"
                                                            onClick={() => deleteMutation.mutate({ id: notification.id })}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
