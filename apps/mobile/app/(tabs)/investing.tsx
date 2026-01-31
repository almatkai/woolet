import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { trpc } from '@/utils/trpc';
import { StatusBar } from 'expo-status-bar';
import { TrendingUp, TrendingDown, PieChart, History, Plus, LineChart, BarChart3, DollarSign, Wallet } from 'lucide-react-native';
import { PortfolioChart, AllocationBars } from '@/components/charts/PortfolioChart';
import { GlassCard } from '@/components/GlassCard';
import { AddInvestmentSheet } from '@/components/AddInvestmentSheet';

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
    red: '#EF4444',
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: 16,
        paddingTop: 12,
    },
    header: {
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.text,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 4,
    },
    summaryCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginBottom: 16,
    },
    summaryTitle: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.text,
    },
    summaryChange: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    changeText: {
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 4,
    },
    changePositive: {
        color: colors.green,
    },
    changeNegative: {
        color: colors.red,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    tabActive: {
        backgroundColor: colors.background,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.text,
    },
    holdingCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginBottom: 12,
        overflow: 'hidden',
    },
    holdingMain: {
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    holdingLeft: {
        flex: 1,
    },
    holdingTicker: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    holdingName: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    holdingShares: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    holdingRight: {
        alignItems: 'flex-end',
    },
    holdingValue: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    holdingChange: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 4,
    },
    holdingFooter: {
        backgroundColor: colors.background,
        paddingVertical: 8,
        paddingHorizontal: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: colors.cardBorder,
    },
    footerLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    footerValue: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.text,
    },
    transactionCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        padding: 16,
        marginBottom: 12,
    },
    transactionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    transactionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    transactionBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
    },
    badgeBuy: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
    },
    badgeSell: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    badgeTextBuy: {
        color: colors.green,
    },
    badgeTextSell: {
        color: colors.red,
    },
    transactionTicker: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
    },
    transactionDate: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    transactionRight: {
        alignItems: 'flex-end',
    },
    transactionAmount: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
    },
    transactionDetails: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    emptyCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 12,
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
            web: {
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
            },
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
    // Chart styles
    chartHeader: {
        marginBottom: 12,
    },
    chartTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    chartTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
    },
    legendRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        fontSize: 11,
        color: colors.textMuted,
    },
    chartLoading: {
        height: 150,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chartEmpty: {
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    outperformanceText: {
        fontSize: 12,
        fontWeight: '500',
        textAlign: 'center',
        marginTop: 8,
    },
});

// Format currency
const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
};

export default function InvestingScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'holdings' | 'transactions'>('holdings');
    const [showAddSheet, setShowAddSheet] = useState(false);

    const { data: summary, isLoading, refetch } = trpc.investing.getPortfolioSummary.useQuery();
    const { data: transactions, refetch: refetchTx } = trpc.investing.getTransactions.useQuery({});
    const { data: benchmarkComparison, isLoading: isBenchmarkLoading, refetch: refetchBenchmark } = trpc.investing.getBenchmarkComparison.useQuery({
        range: '1Y',
    });

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refetch(), refetchTx(), refetchBenchmark()]);
        setRefreshing(false);
    }, [refetch, refetchTx, refetchBenchmark]);

    const holdingsWithAllocation = useMemo(() => {
        if (!summary?.holdings || summary.holdings.length === 0) return [];
        const total = summary.currentValue || 1;
        return (summary.holdings as any[])
            .map((h) => ({
                ...h,
                allocation: (h.currentValue / total) * 100,
            }))
            .sort((a, b) => b.currentValue - a.currentValue);
    }, [summary]);

    // Build chart data from benchmark comparison
    const chartData = useMemo(() => {
        const portfolioSeries = benchmarkComparison?.portfolio?.chartData || [];
        const benchmarkSeries = benchmarkComparison?.benchmark?.chartData || [];
        if (portfolioSeries.length === 0 || benchmarkSeries.length === 0) return [];

        const benchmarkMap = new Map(benchmarkSeries.map((point: any) => [point.date, point.value]));
        return portfolioSeries.map((point: any) => ({
            date: point.date,
            portfolio: point.value,
            benchmark: benchmarkMap.get(point.date) ?? 0,
        }));
    }, [benchmarkComparison]);

    const portfolioReturnPercent = benchmarkComparison?.portfolio?.returnPercent ?? 0;
    const benchmarkReturnPercent = benchmarkComparison?.benchmark?.returnPercent ?? 0;
    const outperformance = portfolioReturnPercent - benchmarkReturnPercent;

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    const totalUnrealizedPL = summary?.unrealizedPL || 0;
    const totalUnrealizedPLPercent = summary?.unrealizedPLPercent || 0;
    const isPositive = totalUnrealizedPL >= 0;

    return (
        <View style={styles.container}>
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

                {/* Summary Card */}
                <GlassCard style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Total Value</Text>
                    <Text style={styles.summaryValue}>
                        {formatCurrency(summary?.currentValue || 0)}
                    </Text>
                    <View style={styles.summaryChange}>
                        {isPositive ? (
                            <TrendingUp size={16} color={colors.green} />
                        ) : (
                            <TrendingDown size={16} color={colors.red} />
                        )}
                        <Text
                            style={[
                                styles.changeText,
                                isPositive ? styles.changePositive : styles.changeNegative,
                            ]}
                        >
                            {formatCurrency(totalUnrealizedPL)} ({totalUnrealizedPLPercent.toFixed(2)}%)
                        </Text>
                    </View>
                </GlassCard>

                {/* Asset Growth Chart */}
                <GlassCard style={styles.summaryCard}>
                    <View style={styles.chartHeader}>
                        <View style={styles.chartTitleRow}>
                            <LineChart size={16} color={colors.textMuted} />
                            <Text style={styles.chartTitle}>Asset Growth (1Y)</Text>
                        </View>
                        {chartData.length > 0 && (
                            <View style={styles.legendRow}>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: colors.green }]} />
                                    <Text style={styles.legendText}>Portfolio {portfolioReturnPercent >= 0 ? '+' : ''}{portfolioReturnPercent.toFixed(1)}%</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
                                    <Text style={styles.legendText}>S&P 500 {benchmarkReturnPercent >= 0 ? '+' : ''}{benchmarkReturnPercent.toFixed(1)}%</Text>
                                </View>
                            </View>
                        )}
                    </View>
                    {isBenchmarkLoading ? (
                        <View style={styles.chartLoading}>
                            <Text style={styles.loadingText}>Loading chart...</Text>
                        </View>
                    ) : chartData.length === 0 ? (
                        <View style={styles.chartEmpty}>
                            <LineChart size={32} color={colors.textSecondary} />
                            <Text style={styles.emptyText}>Add investments to see growth</Text>
                        </View>
                    ) : (
                        <>
                            <PortfolioChart data={chartData} height={180} />
                            <Text style={[
                                styles.outperformanceText,
                                { color: outperformance >= 0 ? colors.green : colors.red }
                            ]}>
                                {outperformance >= 0 ? 'Outperformed' : 'Underperformed'} by {Math.abs(outperformance).toFixed(1)}%
                            </Text>
                        </>
                    )}
                </GlassCard>

                {/* Asset Allocation Card */}
                {holdingsWithAllocation.length > 0 && (
                    <GlassCard style={styles.summaryCard}>
                        <View style={styles.chartTitleRow}>
                            <PieChart size={16} color={colors.textMuted} />
                            <Text style={styles.chartTitle}>Asset Allocation</Text>
                        </View>
                        <AllocationBars holdings={holdingsWithAllocation} />
                    </GlassCard>
                )}

                {/* Tabs */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'holdings' && styles.tabActive]}
                        onPress={() => setActiveTab('holdings')}
                    >
                        <PieChart
                            size={16}
                            color={activeTab === 'holdings' ? colors.text : colors.textSecondary}
                        />
                        <Text
                            style={[
                                styles.tabText,
                                activeTab === 'holdings' && styles.tabTextActive,
                            ]}
                        >
                            Holdings
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'transactions' && styles.tabActive]}
                        onPress={() => setActiveTab('transactions')}
                    >
                        <History
                            size={16}
                            color={activeTab === 'transactions' ? colors.text : colors.textSecondary}
                        />
                        <Text
                            style={[
                                styles.tabText,
                                activeTab === 'transactions' && styles.tabTextActive,
                            ]}
                        >
                            History
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Content */}
                {activeTab === 'holdings' ? (
                    holdingsWithAllocation.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <PieChart size={48} color={colors.textSecondary} />
                            <Text style={styles.emptyText}>No holdings found</Text>
                        </View>
                    ) : (
                        holdingsWithAllocation.map((holding) => (
                            <GlassCard key={holding.stockId} style={styles.holdingCard}>
                                <View style={styles.holdingMain}>
                                    <View style={styles.holdingLeft}>
                                        <Text style={styles.holdingTicker}>{holding.ticker}</Text>
                                        <Text style={styles.holdingName} numberOfLines={1}>
                                            {holding.name}
                                        </Text>
                                        <Text style={styles.holdingShares}>
                                            {holding.quantity} shares @ {formatCurrency(holding.currentPrice)}
                                        </Text>
                                    </View>
                                    <View style={styles.holdingRight}>
                                        <Text style={styles.holdingValue}>
                                            {formatCurrency(holding.currentValue)}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.holdingChange,
                                                holding.unrealizedPL >= 0
                                                    ? styles.changePositive
                                                    : styles.changeNegative,
                                            ]}
                                        >
                                            {holding.unrealizedPL >= 0 ? '+' : ''}
                                            {holding.unrealizedPLPercent.toFixed(2)}%
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.holdingFooter}>
                                    <Text style={styles.footerLabel}>Allocation</Text>
                                    <Text style={styles.footerValue}>
                                        {holding.allocation.toFixed(1)}%
                                    </Text>
                                </View>
                            </GlassCard>
                        ))
                    )
                ) : !transactions || transactions.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <History size={48} color={colors.textSecondary} />
                        <Text style={styles.emptyText}>No transactions yet</Text>
                    </View>
                ) : (
                    transactions.map((tx: any) => (
                        <View key={tx.id} style={styles.transactionCard}>
                            <View style={styles.transactionHeader}>
                                <View style={styles.transactionLeft}>
                                    <View
                                        style={[
                                            styles.transactionBadge,
                                            tx.type === 'buy' ? styles.badgeBuy : styles.badgeSell,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.badgeText,
                                                tx.type === 'buy'
                                                    ? styles.badgeTextBuy
                                                    : styles.badgeTextSell,
                                            ]}
                                        >
                                            {tx.type}
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={styles.transactionTicker}>{tx.stock.ticker}</Text>
                                        <Text style={styles.transactionDate}>
                                            {new Date(tx.date).toLocaleDateString()}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.transactionRight}>
                                    <Text style={styles.transactionAmount}>
                                        {formatCurrency(tx.quantity * tx.pricePerShare)}
                                    </Text>
                                    <Text style={styles.transactionDetails}>
                                        {tx.quantity} @ {formatCurrency(tx.pricePerShare)}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setShowAddSheet(true)}>
                <Plus size={24} color="#fff" />
            </TouchableOpacity>

            <AddInvestmentSheet open={showAddSheet} onOpenChange={setShowAddSheet} />
        </View>
    );
}
