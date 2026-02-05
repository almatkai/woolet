import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Bell, Check, ExternalLink, AlertCircle, CalendarClock, CreditCard, TrendingUp, Wallet, DollarSign, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../src/utils/trpc';

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    priority: string;
    links?: Record<string, string> | null;
    entityType?: string | null;
    entityId?: string | null;
    isRead: boolean;
    createdAt: Date | string;
    actionTaken?: boolean | null;
    actionTakenAt?: Date | null;
}

const priorityColors = {
    low: '#3b82f6',
    medium: '#eab308',
    high: '#f97316',
    urgent: '#ef4444',
};

const typeIcons: Record<string, typeof Bell> = {
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

export default function NotificationsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
    const [refreshing, setRefreshing] = useState(false);

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

    const formatTimeAgo = (dateInput: Date | string) => {
        const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
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

    const handleNotificationPress = (notification: Notification) => {
        if (!notification.isRead) {
            markAsReadMutation.mutate({ id: notification.id });
        }

        if (notification.links?.mobile) {
            router.navigate(notification.links.mobile as any);
        } else if (notification.links?.web) {
            router.navigate(notification.links.web as any);
        }
    };

    const notifications = notificationsData?.notifications || [];
    const unreadCount = notificationsData?.unreadCount || 0;

    const filteredNotifications = notifications.filter((n: Notification) => {
        if (activeTab === 'unread') return !n.isRead;
        return true;
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Notifications</Text>
                <Text style={styles.subtitle}>
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                </Text>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'all' && styles.activeTab]}
                    onPress={() => setActiveTab('all')}
                >
                    <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
                        All
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'unread' && styles.activeTab]}
                    onPress={() => setActiveTab('unread')}
                >
                    <Text style={[styles.tabText, activeTab === 'unread' && styles.activeTabText]}>
                        Unread
                        {unreadCount > 0 && (
                            <Text style={styles.unreadBadge}> ({unreadCount})</Text>
                        )}
                    </Text>
                </TouchableOpacity>
            </View>

            {unreadCount > 0 && (
                <TouchableOpacity
                    style={styles.markAllReadButton}
                    onPress={() => markAllAsReadMutation.mutate()}
                >
                    <Check size={16} color="#8B5CF6" />
                    <Text style={styles.markAllReadText}>Mark all as read</Text>
                </TouchableOpacity>
            )}

            {filteredNotifications.length === 0 ? (
                <View style={styles.emptyState}>
                    <Bell size={64} color="#4B5563" />
                    <Text style={styles.emptyTitle}>No notifications</Text>
                    <Text style={styles.emptySubtitle}>
                        {activeTab === 'unread'
                            ? 'You have no unread notifications'
                            : 'You are all caught up!'}
                    </Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                >
                    {filteredNotifications.map((notification: Notification) => {
                        const Icon = typeIcons[notification.type] || Bell;
                        const isUnread = !notification.isRead;

                        return (
                            <TouchableOpacity
                                key={notification.id}
                                style={[
                                    styles.notificationItem,
                                    isUnread && styles.unreadNotification
                                ]}
                                onPress={() => handleNotificationPress(notification)}
                            >
                                <View style={[
                                    styles.iconContainer,
                                    { backgroundColor: priorityColors[notification.priority as keyof typeof priorityColors] || '#6B7280' }
                                ]}>
                                    <Icon size={24} color="#FFFFFF" />
                                </View>

                                <View style={styles.notificationContent}>
                                    <View style={styles.notificationHeader}>
                                        <Text style={[
                                            styles.notificationTitle,
                                            isUnread && styles.unreadText
                                        ]}>
                                            {notification.title}
                                        </Text>
                                        {isUnread && <View style={styles.unreadDot} />}
                                    </View>

                                    <Text style={styles.notificationMessage} numberOfLines={2}>
                                        {notification.message}
                                    </Text>

                                    <View style={styles.notificationFooter}>
                                        <Text style={styles.notificationTime}>
                                            {formatTimeAgo(notification.createdAt)}
                                        </Text>
                                        <View style={styles.actionButtons}>
                                            {!notification.isRead && (
                                                <TouchableOpacity
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        markAsReadMutation.mutate({ id: notification.id });
                                                    }}
                                                >
                                                    <Check size={16} color="#6B7280" />
                                                </TouchableOpacity>
                                            )}

                                            {notification.links?.mobile && (
                                                <ExternalLink size={16} color="#6B7280" />
                                            )}

                                            <TouchableOpacity
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    deleteMutation.mutate({ id: notification.id });
                                                }}
                                            >
                                                <Trash2 size={16} color="#6B7280" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111827',
        padding: 16,
    },
    header: {
        marginBottom: 16,
    },
    title: {
        color: '#F9FAFB',
        fontSize: 28,
        fontWeight: 'bold',
    },
    subtitle: {
        color: '#9CA3AF',
        fontSize: 14,
        marginTop: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
        backgroundColor: '#374151',
    },
    activeTab: {
        backgroundColor: '#8B5CF6',
    },
    tabText: {
        color: '#9CA3AF',
        fontSize: 14,
        fontWeight: '600',
    },
    activeTabText: {
        color: '#FFFFFF',
    },
    unreadBadge: {
        color: '#FCD34D',
    },
    markAllReadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginBottom: 12,
        borderRadius: 8,
        backgroundColor: '#8B5CF6' + '20',
    },
    markAllReadText: {
        color: '#8B5CF6',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8,
    },
    scrollView: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 64,
    },
    emptyTitle: {
        color: '#F9FAFB',
        fontSize: 20,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtitle: {
        color: '#9CA3AF',
        fontSize: 14,
        marginTop: 4,
    },
    notificationItem: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        backgroundColor: '#1F2937',
    },
    unreadNotification: {
        backgroundColor: '#8B5CF6' + '20',
        borderWidth: 1,
        borderColor: '#8B5CF6' + '40',
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    notificationContent: {
        flex: 1,
    },
    notificationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    notificationTitle: {
        color: '#9CA3AF',
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
    },
    unreadText: {
        color: '#F9FAFB',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#8B5CF6',
        marginLeft: 8,
    },
    notificationMessage: {
        color: '#6B7280',
        fontSize: 14,
        marginTop: 4,
    },
    notificationFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    notificationTime: {
        color: '#4B5563',
        fontSize: 12,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
    },
});
