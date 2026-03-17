'use client';

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, Check, ExternalLink, AlertCircle, CalendarClock, CreditCard, TrendingUp, Wallet, DollarSign } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
    createdAt: string;
}

const priorityColors = {
    low: 'bg-blue-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    urgent: 'bg-red-500',
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

export function NotificationsMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const lastNotifiedId = useRef<string | null>(null);
    const navigate = useNavigate();

    const { data: notificationsData, refetch } = trpc.notification.list.useQuery(
        { limit: 10, unreadOnly: true },
        { refetchInterval: 30000 }
    );

    // Browser notification effect
    useEffect(() => {
        if (!notificationsData?.notifications || notificationsData.notifications.length === 0) return;

        const latestNotification = notificationsData.notifications[0] as Notification;

        console.log('[Notification Debug] Latest:', latestNotification.title, 'isRead:', latestNotification.isRead);

        // Notify if it's new, unread, and we haven't notified about it yet
        if (!latestNotification.isRead && latestNotification.id !== lastNotifiedId.current) {
            console.log('[Notification Debug] Triggering native notification...');

            if ('Notification' in window) {
                console.log('[Notification Debug] Permission state:', Notification.permission);

                const showNotification = () => {
                    try {
                        const notification = new window.Notification(latestNotification.title, {
                            body: latestNotification.message,
                            icon: '/assets/woolet-icon.png',
                            tag: latestNotification.id,
                        });

                        notification.onclick = () => {
                            window.focus();
                            if (latestNotification.links?.web) {
                                navigate({ to: latestNotification.links.web });
                            }
                            notification.close();
                        };
                        console.log('[Notification Debug] Notification object created successfully');
                    } catch (e) {
                        console.error('[Notification Debug] Error creating Notification:', e);
                    }
                };

                if (Notification.permission === 'granted') {
                    showNotification();
                } else if (Notification.permission !== 'denied') {
                    console.log('[Notification Debug] Requesting permission...');
                    Notification.requestPermission().then(permission => {
                        console.log('[Notification Debug] Permission result:', permission);
                        if (permission === 'granted') {
                            showNotification();
                        }
                    });
                }
            } else {
                console.warn('[Notification Debug] Notifications API not supported in this browser');
            }
            lastNotifiedId.current = latestNotification.id;
        }
    }, [notificationsData?.notifications, navigate]);

    const markAsReadMutation = trpc.notification.markAsRead.useMutation({
        onSuccess: () => refetch(),
    });

    const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
        onSuccess: () => refetch(),
    });

    // deleteMutation removed (unused)

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.isRead) {
            markAsReadMutation.mutate({ id: notification.id });
        }

        if (notification.links?.web) {
            const url = notification.links.web;
            setTimeout(() => {
                navigate({ to: url });
            }, 0);
        }
        setIsOpen(false);
    };

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const notifications = notificationsData?.notifications || [];
    const unreadCount = notificationsData?.unreadCount || 0;

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white font-bold animate-pulse">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-[380px] rounded-[32px] border-border/40 bg-card/70 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/20 bg-muted/10">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <Bell className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-bold text-base">Notifications</span>
                        {unreadCount > 0 && (
                            <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {unreadCount} New
                            </span>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAllAsReadMutation.mutate()}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-primary/10 rounded-lg px-2.5"
                        >
                            <Check className="h-3.5 w-3.5 mr-1.5" />
                            Mark all read
                        </Button>
                    )}
                </div>

                {notifications.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center text-muted-foreground">
                        <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 ring-1 ring-border/50">
                            <Bell className="h-8 w-8 opacity-40" />
                        </div>
                        <p className="text-sm font-semibold">No notifications yet</p>
                        <p className="text-xs opacity-70 mt-1">You're all caught up!</p>
                    </div>
                ) : (
                    <ScrollArea className="h-[400px] p-3">
                        <div className="space-y-1.5">
                            {notifications.map((notification: Notification) => {
                                const Icon = typeIcons[notification.type as keyof typeof typeIcons] || Bell;
                                const isUnread = !notification.isRead;

                                return (
                                    <DropdownMenuItem
                                        key={notification.id}
                                        className={cn(
                                            "flex items-start gap-3.5 px-3 py-3 cursor-pointer rounded-2xl transition-all border border-transparent",
                                            isUnread ? "bg-primary/10 hover:bg-primary/15 border-primary/10" : "hover:bg-muted/40"
                                        )}
                                        onClick={() => handleNotificationClick(notification)}
                                    >
                                        <div className={cn(
                                            "mt-0.5 h-10 w-10 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                                            priorityColors[notification.priority as keyof typeof priorityColors] || 'bg-muted'
                                        )}>
                                            <Icon className="h-4 w-4 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0 pt-0.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={cn(
                                                    "text-[13px] font-semibold truncate leading-tight",
                                                    isUnread ? "text-foreground" : "text-muted-foreground"
                                                )}>
                                                    {notification.title}
                                                </p>
                                                {isUnread && (
                                                    <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-snug">
                                                {notification.message}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-medium uppercase tracking-wider">
                                                {formatTimeAgo(notification.createdAt)}
                                            </p>
                                        </div>
                                        {notification.links?.web && (
                                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-1" />
                                        )}
                                    </DropdownMenuItem>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )}

                <div className="p-3 border-t border-border/20 bg-muted/5">
                    <DropdownMenuItem asChild className="p-0">
                        <Link to="/notifications" className="w-full block">
                            <Button variant="ghost" className="w-full justify-center text-primary font-semibold text-sm rounded-xl h-10 hover:bg-primary/20 transition-colors">
                                View all notifications
                            </Button>
                        </Link>
                    </DropdownMenuItem>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
