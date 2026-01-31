import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { trpc } from '@/utils/trpc';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Home, Calendar, Percent } from 'lucide-react-native';

const colors = {
    background: '#111827',
    card: '#1F2937',
    cardBorder: '#374151',
    text: '#F9FAFB',
    textMuted: '#9CA3AF',
    textSecondary: '#6B7280',
    blue: '#3B82F6',
    green: '#10B981',
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 16, paddingBottom: 100 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    headerTitle: { fontSize: 24, fontWeight: '700', color: colors.text },
    headerSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    summaryCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.cardBorder },
    summaryLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
    summaryValue: { fontSize: 20, fontWeight: '700', color: colors.text },
    summaryValueBlue: { color: colors.blue },
    card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
    cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(59, 130, 246, 0.2)' },
    badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: colors.blue },
    progressBar: { height: 6, backgroundColor: colors.background, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
    progressFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 3 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 12, padding: 12 },
    statItem: { alignItems: 'center' },
    statLabel: { fontSize: 11, color: colors.textSecondary },
    statValue: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 2 },
    emptyCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 40, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 14, color: colors.textMuted, marginTop: 12, textAlign: 'center' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    loadingText: { color: colors.textMuted, fontSize: 16 },
});

const formatCurrency = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);

import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ListSkeleton } from '@/components/SkeletonLoaders';

export default function MortgagesScreen() {
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const { data: mortgages, isLoading, refetch } = trpc.mortgage.list.useQuery();

    const onRefresh = React.useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

    const stats = React.useMemo(() => {
        if (!mortgages) return { totalRemaining: 0, totalMonthly: 0 };
        return mortgages.reduce((acc, m: any) => {
            acc.totalRemaining += Number(m.remainingBalance);
            acc.totalMonthly += Number(m.monthlyPayment);
            return acc;
        }, { totalRemaining: 0, totalMonthly: 0 } as { totalRemaining: number; totalMonthly: number });
    }, [mortgages]);

    return (
        <ScreenWrapper style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
                    >
                        <ArrowLeft size={20} color={colors.text} />
                    </TouchableOpacity>
                    <View><Text style={styles.headerTitle}>Mortgages</Text><Text style={styles.headerSubtitle}>Home loans</Text></View>
                </View>

                {isLoading ? (
                    <ListSkeleton count={2} />
                ) : (
                    <>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Remaining</Text><Text style={styles.summaryValue}>{formatCurrency(stats.totalRemaining)}</Text></View>
                            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Monthly</Text><Text style={[styles.summaryValue, styles.summaryValueBlue]}>{formatCurrency(stats.totalMonthly)}</Text></View>
                        </View>
                        {(!mortgages || mortgages.length === 0) ? (
                            <View style={styles.emptyCard}><Home size={48} color={colors.textSecondary} /><Text style={styles.emptyText}>No mortgages found</Text></View>
                        ) : (
                            mortgages.map((m: any) => {
                                const payoffPercent = Math.round(((Number(m.principalAmount) - Number(m.remainingBalance)) / Number(m.principalAmount)) * 100);
                                return (
                                    <View key={m.id} style={styles.card}>
                                        <View style={styles.cardHeader}>
                                            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{m.propertyName}</Text><Text style={styles.cardMeta}>{m.account?.name || 'Account'}</Text></View>
                                            <View style={styles.badge}><Text style={styles.badgeText}>{m.status}</Text></View>
                                        </View>
                                        <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${payoffPercent}%` }]} /></View>
                                        <View style={styles.statsRow}>
                                            <View style={styles.statItem}><Text style={styles.statLabel}>Rate</Text><Text style={styles.statValue}>{m.interestRate}%</Text></View>
                                            <View style={styles.statItem}><Text style={styles.statLabel}>Monthly</Text><Text style={styles.statValue}>{formatCurrency(Number(m.monthlyPayment))}</Text></View>
                                            <View style={styles.statItem}><Text style={styles.statLabel}>Remaining</Text><Text style={styles.statValue}>{formatCurrency(Number(m.remainingBalance))}</Text></View>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </>
                )}
            </ScrollView>
        </ScreenWrapper>
    );
}
