import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, Text, Dimensions, ViewStyle } from 'react-native';
import { Bell, Check, X, ExternalLink, AlertCircle, CalendarClock, CreditCard, TrendingUp, Wallet, DollarSign } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { trpc } from '../utils/trpc';

const { height } = Dimensions.get('window');

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
    userId?: string;
    updatedAt?: Date;
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

export function NotificationsBell() {
    const router = useRouter();
    const { isSignedIn } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

    const { data: notificationsData, refetch } = trpc.notification.list.useQuery(
        { limit: 20 },
        { enabled: isSignedIn, refetchInterval: 30000 }
    );

    const markAsReadMutation = trpc.notification.markAsRead.useMutation({
        onSuccess: () => refetch(),
    });

    const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
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
        setShowModal(false);
    };

    const notifications = notificationsData?.notifications || [];
    const unreadCount = notificationsData?.unreadCount || 0;

    const filteredNotifications = notifications.filter((n: Notification) => {
        if (activeTab === 'unread') return !n.isRead;
        return true;
    });

    if (!isSignedIn) return null;

    return (
        <>
            <TouchableOpacity 
                style={styles.bellButton} 
                onPress={() => setShowModal(true)}
            >
                <Bell size={22} color="#F9FAFB" />
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>

            <Modal
                visible={showModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowModal(false)}
            >
                <Pressable 
                    style={styles.modalOverlay} 
                    onPress={() => setShowModal(false)}
                >
                    <Pressable 
                        style={styles.modalContent}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Notifications</Text>
                            <TouchableOpacity 
                                style={styles.closeButton}
                                onPress={() => setShowModal(false)}
                            >
                                <X size={24} color="#9CA3AF" />
                            </TouchableOpacity>
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

                        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                            {filteredNotifications.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Bell size={48} color="#4B5563" />
                                    <Text style={styles.emptyTitle}>No notifications</Text>
                                    <Text style={styles.emptySubtitle}>
                                        {activeTab === 'unread' 
                                            ? 'You have no unread notifications' 
                                            : 'You are all caught up!'}
                                    </Text>
                                </View>
                            ) : (
                                filteredNotifications.map((notification: Notification) => {
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
                                                <Icon size={20} color="#FFFFFF" />
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
                                                
                                                <Text style={styles.notificationTime}>
                                                    {formatTimeAgo(notification.createdAt)}
                                                </Text>
                                            </View>

                                            {notification.links?.mobile && (
                                                <ExternalLink size={16} color="#6B7280" />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>

                        <TouchableOpacity 
                            style={styles.viewAllButton}
                            onPress={() => {
                                setShowModal(false);
                                router.navigate('/notifications' as any);
                            }}
                        >
                            <Text style={styles.viewAllText}>View all notifications</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    bellButton: {
        padding: 8,
        marginRight: 8,
    },
    badge: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1F2937',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: height * 0.8,
        paddingBottom: 32,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
    },
    modalTitle: {
        color: '#F9FAFB',
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeButton: {
        padding: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 16,
        gap: 8,
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
        marginHorizontal: 16,
        marginTop: 12,
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
        maxHeight: height * 0.5,
        padding: 16,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyTitle: {
        color: '#F9FAFB',
        fontSize: 18,
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
        alignItems: 'flex-start',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
        backgroundColor: '#374151',
    },
    unreadNotification: {
        backgroundColor: '#8B5CF6' + '20',
        borderWidth: 1,
        borderColor: '#8B5CF6' + '40',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
        fontSize: 14,
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
        fontSize: 13,
        marginTop: 2,
    },
    notificationTime: {
        color: '#4B5563',
        fontSize: 12,
        marginTop: 4,
    },
    viewAllButton: {
        alignItems: 'center',
        paddingVertical: 16,
        marginHorizontal: 16,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#374151',
    },
    viewAllText: {
        color: '#8B5CF6',
        fontSize: 14,
        fontWeight: '600',
    },
});
