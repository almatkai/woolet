import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { trpc } from '@/utils/trpc';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Clock, CheckCircle2, Circle, Plus } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { AddSubscriptionSheet } from '@/components/AddSubscriptionSheet';

// ===== STYLES =====
const colors = {
    background: '#111827',
    card: '#1F2937',
    cardBorder: '#374151',
    text: '#F9FAFB',
    textMuted: '#9CA3AF',
    textSecondary: '#6B7280',
    accent: '#8B5CF6',
    green: '#10B981',
    orange: '#F97316',
    indigo: '#6366F1',
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
    },
    headerSubtitle: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 2,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 12,
        marginTop: 8,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        padding: 16,
        marginBottom: 10,
    },
    subRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    subLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    subIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    subIconText: {
        fontSize: 18,
    },
    subName: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
    },
    subMeta: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    subAmount: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '500',
        marginLeft: 4,
    },
    statusPaid: {
        color: colors.green,
    },
    statusPending: {
        color: colors.orange,
    },
    emptyCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 12,
        textAlign: 'center',
    },
    fab: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 104 : 80,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            default: {
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: 8,
            },
        }),
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
    },
    loadingText: {
        color: colors.textMuted,
        fontSize: 16,
    },
});

const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
};

import { ScreenWrapper } from '@/components/ScreenWrapper';
import { SubscriptionListSkeleton } from '@/components/SkeletonLoaders';

export default function SubscriptionsScreen() {
    const router = useRouter();
    const [refreshing, setRefreshing] = React.useState(false);
    const [showAddSub, setShowAddSub] = React.useState(false);

    const { data: subscriptionsData, isLoading: isLoadingSubs, refetch: refetchSubs } = trpc.subscription.list.useQuery({
        includeLinkedEntities: true,
    });
    const { data: upcomingData, isLoading: isLoadingUpcoming, refetch: refetchUpcoming } = trpc.subscription.getUpcoming.useQuery({ days: 30 });

    const isLoading = isLoadingSubs || isLoadingUpcoming;

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refetchSubs(), refetchUpcoming()]);
        setRefreshing(false);
    }, [refetchSubs, refetchUpcoming]);

    const allSubscriptions = React.useMemo(() => {
        if (!subscriptionsData) return [];
        return [
            ...subscriptionsData.subscriptions,
            ...(subscriptionsData.linkedItems || []),
        ];
    }, [subscriptionsData]);

    return (
        <ScreenWrapper style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.text}
                    />
                }
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
                    >
                        <ArrowLeft size={20} color={colors.text} />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>Subscriptions</Text>
                        <Text style={styles.headerSubtitle}>Recurring payments</Text>
                    </View>
                </View>

                {isLoading ? (
                    <SubscriptionListSkeleton count={4} />
                ) : (
                    <>
                        {/* Upcoming */}
                        <Text style={styles.sectionTitle}>Upcoming Payments</Text>
                        {(!upcomingData || upcomingData.length === 0) ? (
                            <View style={styles.emptyCard}>
                                <Clock size={40} color={colors.textSecondary} />
                                <Text style={styles.emptyText}>No upcoming payments in the next 30 days</Text>
                            </View>
                        ) : (
                            upcomingData.map((item: any, idx: number) => (
                                <View key={`${item.subscription.id}-${idx}`} style={styles.card}>
                                    <View style={styles.subRow}>
                                        <View style={styles.subLeft}>
                                            <View style={styles.subIcon}>
                                                <Text style={styles.subIconText}>{item.subscription.icon || '💳'}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.subName}>{item.subscription.name}</Text>
                                                <Text style={styles.subMeta}>
                                                    Due {item.dueDate ? format(parseISO(item.dueDate), 'MMM d, yyyy') : 'Date TBD'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.subAmount}>
                                                {formatCurrency(Number(item.subscription.amount), item.subscription.currency)}
                                            </Text>
                                            <View style={styles.statusRow}>
                                                {item.isPaid ? (
                                                    <>
                                                        <CheckCircle2 size={12} color={colors.green} />
                                                        <Text style={[styles.statusText, styles.statusPaid]}>Paid</Text>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Circle size={12} color={colors.orange} />
                                                        <Text style={[styles.statusText, styles.statusPending]}>Pending</Text>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            ))
                        )}

                        {/* All Subscriptions */}
                        <Text style={styles.sectionTitle}>Your Subscriptions</Text>
                        {allSubscriptions.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyText}>No subscriptions tracked yet</Text>
                            </View>
                        ) : (
                            allSubscriptions.map((sub: any) => (
                                <View key={sub.id} style={styles.card}>
                                    <View style={styles.subRow}>
                                        <View style={styles.subLeft}>
                                            <View style={styles.subIcon}>
                                                <Text style={styles.subIconText}>{sub.icon || '💳'}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.subName}>{sub.name}</Text>
                                                <Text style={styles.subMeta}>
                                                    {sub.frequency} • {sub.status}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.subAmount}>
                                            {formatCurrency(Number(sub.amount), sub.currency)}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </>
                )}
            </ScrollView>

            {/* FAB */}
            {!isLoading && (
                <TouchableOpacity style={styles.fab} onPress={() => setShowAddSub(true)}>
                    <Plus size={24} color="#fff" />
                </TouchableOpacity>
            )}

            <AddSubscriptionSheet open={showAddSub} onOpenChange={setShowAddSub} />
        </ScreenWrapper>
    );
}
