import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { trpc } from '@/utils/trpc';
import { StatusBar } from 'expo-status-bar';
import { Landmark, CreditCard, Wallet, Banknote, Plus, ChevronRight } from 'lucide-react-native';
import { AddBankSheet } from '@/components/AddBankSheet';
import { AddAccountSheet } from '@/components/AddAccountSheet';
import { GlassCard } from '@/components/GlassCard';

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
    blue: '#3B82F6',
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
    bankHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginTop: 16,
        paddingHorizontal: 4,
    },
    bankHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bankName: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginLeft: 8,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginBottom: 8,
        overflow: 'hidden',
    },
    accountItem: {
        padding: 16,
    },
    accountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    accountIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    accountIconChecking: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
    },
    accountIconSavings: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
    },
    accountIconCash: {
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
    },
    accountIconDefault: {
        backgroundColor: 'rgba(107, 114, 128, 0.2)',
    },
    accountName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
    },
    accountType: {
        fontSize: 12,
        color: colors.textSecondary,
        textTransform: 'capitalize',
        marginTop: 2,
    },
    balanceContainer: {
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: 12,
    },
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    currencyCode: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textMuted,
    },
    balanceAmount: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    emptyText: {
        fontSize: 12,
        color: colors.textSecondary,
        fontStyle: 'italic',
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
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyIcon: {
        marginBottom: 8,
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

interface CurrencyBalance {
    id: string;
    currencyCode: string;
    balance: string | number;
}

interface Account {
    id: string;
    name: string;
    type: string;
    icon?: string | null;
    currencyBalances: CurrencyBalance[];
}

interface Bank {
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    accounts: Account[];
}

export default function AccountsScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [showAddBank, setShowAddBank] = useState(false);
    const [selectedBank, setSelectedBank] = useState<{ id: string; name: string } | null>(null);

    const { data: banks, isLoading, refetch } = trpc.bank.getHierarchy.useQuery(undefined, {
        staleTime: 1000 * 60,
    }) as { data: Bank[] | undefined; isLoading: boolean; refetch: () => Promise<any> };

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

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

                {(!banks || banks.length === 0) ? (
                    <View style={[styles.card, { padding: 24 }]}>
                        <View style={styles.emptyContainer}>
                            <Landmark size={48} color={colors.textSecondary} style={styles.emptyIcon} />
                            <Text style={styles.emptyText}>No accounts found.</Text>
                            <Text style={[styles.emptyText, { marginTop: 4 }]}>Tap + to add a bank</Text>
                        </View>
                    </View>
                ) : (
                    banks.map((bank) => (
                        <View key={bank.id}>
                            <View style={styles.bankHeader}>
                                <View style={styles.bankHeaderLeft}>
                                    <Landmark size={16} color={colors.textMuted} />
                                    <Text style={styles.bankName}>{bank.name}</Text>
                                </View>
                                <TouchableOpacity onPress={() => setSelectedBank({ id: bank.id, name: bank.name })}>
                                    <Plus size={18} color={colors.textMuted} />
                                </TouchableOpacity>
                            </View>

                            {bank.accounts.map((account) => (
                                <GlassCard key={account.id} style={{ marginBottom: 8 }}>
                                    <View style={styles.accountHeader}>
                                        <View
                                            style={[
                                                styles.accountIcon,
                                                account.type === 'checking'
                                                    ? styles.accountIconChecking
                                                    : account.type === 'savings'
                                                        ? styles.accountIconSavings
                                                        : account.type === 'cash'
                                                            ? styles.accountIconCash
                                                        : styles.accountIconDefault,
                                            ]}
                                        >
                                            {account.type === 'checking' ? (
                                                <CreditCard size={20} color={colors.blue} />
                                            ) : account.type === 'savings' ? (
                                                <Wallet size={20} color={colors.green} />
                                            ) : account.type === 'cash' ? (
                                                <Banknote size={20} color={colors.green} />
                                            ) : (
                                                <Landmark size={20} color={colors.textMuted} />
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.accountName}>{account.name}</Text>
                                            <Text style={styles.accountType}>{account.type}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.balanceContainer}>
                                        {account.currencyBalances.length > 0 ? (
                                            account.currencyBalances.map((balance) => (
                                                <View key={balance.id} style={styles.balanceRow}>
                                                    <Text style={styles.currencyCode}>{balance.currencyCode}</Text>
                                                    <Text style={styles.balanceAmount}>
                                                        {formatCurrency(Number(balance.balance), balance.currencyCode)}
                                                    </Text>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={styles.emptyText}>No balances</Text>
                                        )}
                                    </View>
                                </GlassCard>
                            ))}
                        </View>
                    ))
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setShowAddBank(true)}>
                <Plus size={24} color="#fff" />
            </TouchableOpacity>

            <AddBankSheet open={showAddBank} onOpenChange={setShowAddBank} />

            <AddAccountSheet
                open={!!selectedBank}
                onOpenChange={(open) => !open && setSelectedBank(null)}
                bankId={selectedBank?.id || ''}
                bankName={selectedBank?.name || ''}
            />
        </View>
    );
}
