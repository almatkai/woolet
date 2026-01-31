import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { trpc } from '@/utils/trpc';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Users, Plus, Trash2, ChevronDown } from 'lucide-react-native';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ListSkeleton } from '@/components/SkeletonLoaders';

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
    orange: '#F97316',
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
    sectionCard: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginBottom: 16,
        padding: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 12,
    },
    sectionTitleRed: {
        color: colors.red,
    },
    sectionTitleGreen: {
        color: colors.green,
    },
    debtItem: {
        borderBottomWidth: 1,
        borderBottomColor: colors.cardBorder,
        paddingVertical: 12,
    },
    debtItemLast: {
        borderBottomWidth: 0,
    },
    debtHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    personName: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
    },
    debtDescription: {
        fontSize: 13,
        color: colors.textMuted,
        fontStyle: 'italic',
        marginTop: 2,
    },
    dueDate: {
        fontSize: 12,
        color: colors.orange,
        marginTop: 4,
    },
    debtAmount: {
        fontSize: 15,
        fontWeight: '700',
    },
    amountRed: {
        color: colors.red,
    },
    amountGreen: {
        color: colors.green,
    },
    debtStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.cardBorder,
    },
    statItem: {
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 11,
        color: colors.textSecondary,
        marginBottom: 2,
    },
    statValue: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        paddingVertical: 16,
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

// Format currency
const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
};

interface Debt {
    id: string;
    personName: string;
    amount: string | number;
    type: 'i_owe' | 'they_owe';
    status: 'pending' | 'partial' | 'paid';
    description?: string | null;
    dueDate?: string | null;
    paidAmount?: string | number | null;
    currencyCode?: string | null;
    currencyBalance?: {
        currencyCode: string;
    } | null;
}

export default function DebtsScreen() {
    const router = useRouter();
    const [refreshing, setRefreshing] = React.useState(false);
    const { data: debtsData, isLoading, refetch } = trpc.debt.list.useQuery({}) as {
        data: { debts: Debt[] } | undefined;
        isLoading: boolean;
        refetch: () => Promise<any>;
    };

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const iOweDebts = debtsData?.debts?.filter((d) => d.type === 'i_owe' && d.status !== 'paid') || [];
    const theyOweDebts = debtsData?.debts?.filter((d) => d.type === 'they_owe' && d.status !== 'paid') || [];
    const historyDebts = debtsData?.debts?.filter((d) => d.status === 'paid') || [];

    const getRemaining = (debt: Debt) => Number(debt.amount) - Number(debt.paidAmount || 0);

    const DebtItem = ({ debt, isLast }: { debt: Debt; isLast: boolean }) => {
        const remaining = getRemaining(debt);
        const currency = debt.currencyBalance?.currencyCode || debt.currencyCode || 'USD';
        const colorStyle = debt.type === 'i_owe' ? styles.amountRed : styles.amountGreen;

        return (
            <View style={[styles.debtItem, isLast && styles.debtItemLast]}>
                <View style={styles.debtHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.personName}>{debt.personName}</Text>
                        {debt.description && (
                            <Text style={styles.debtDescription}>{debt.description}</Text>
                        )}
                        {debt.dueDate && (
                            <Text style={styles.dueDate}>
                                Due: {new Date(debt.dueDate).toLocaleDateString()}
                            </Text>
                        )}
                    </View>
                    <Text style={[styles.debtAmount, colorStyle]}>
                        {formatCurrency(remaining, currency)}
                    </Text>
                </View>
                {Number(debt.paidAmount) > 0 && (
                    <View style={styles.debtStats}>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Total</Text>
                            <Text style={styles.statValue}>{formatCurrency(Number(debt.amount), currency)}</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Paid</Text>
                            <Text style={styles.statValue}>{formatCurrency(Number(debt.paidAmount), currency)}</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Remaining</Text>
                            <Text style={[styles.statValue, colorStyle]}>{formatCurrency(remaining, currency)}</Text>
                        </View>
                    </View>
                )}
            </View>
        );
    };

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
                        <Text style={styles.headerTitle}>Debts & Loans</Text>
                        <Text style={styles.headerSubtitle}>Track who owes you</Text>
                    </View>
                </View>

                {isLoading ? (
                    <ListSkeleton count={3} />
                ) : (
                    <>
                        {/* I Owe */}
                        <View style={styles.sectionCard}>
                            <Text style={[styles.sectionTitle, styles.sectionTitleRed]}>I Owe</Text>
                            {iOweDebts.length === 0 ? (
                                <Text style={styles.emptyText}>No debts to pay</Text>
                            ) : (
                                iOweDebts.map((debt, idx) => (
                                    <DebtItem key={debt.id} debt={debt} isLast={idx === iOweDebts.length - 1} />
                                ))
                            )}
                        </View>

                        {/* They Owe Me */}
                        <View style={styles.sectionCard}>
                            <Text style={[styles.sectionTitle, styles.sectionTitleGreen]}>They Owe Me</Text>
                            {theyOweDebts.length === 0 ? (
                                <Text style={styles.emptyText}>No one owes you</Text>
                            ) : (
                                theyOweDebts.map((debt, idx) => (
                                    <DebtItem key={debt.id} debt={debt} isLast={idx === theyOweDebts.length - 1} />
                                ))
                            )}
                        </View>

                        {/* History */}
                        {historyDebts.length > 0 && (
                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionTitle}>History</Text>
                                {historyDebts.map((debt, idx) => (
                                    <DebtItem key={debt.id} debt={debt} isLast={idx === historyDebts.length - 1} />
                                ))}
                            </View>
                        )}
                    </>
                )}
            </ScrollView>

            {/* FAB for adding debt */}
            {!isLoading && (
                <TouchableOpacity style={styles.fab} onPress={() => {/* TODO: Add debt sheet */ }}>
                    <Plus size={24} color="#fff" />
                </TouchableOpacity>
            )}
        </ScreenWrapper>
    );
}
