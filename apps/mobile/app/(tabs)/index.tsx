import React from 'react';
import { Link, useRouter } from 'expo-router';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { trpc } from '@/utils/trpc';
import { StatusBar } from 'expo-status-bar';
import { SignedIn, SignedOut, useAuth, useOAuth } from '@clerk/clerk-expo';
import * as WebBrowser from "expo-web-browser";
import { useWarmUpBrowser } from "@/hooks/useWarmUpBrowser";
import { TrendingUp, TrendingDown, Wallet, ArrowRight, Landmark, Receipt, Calendar, PiggyBank, Banknote, CreditCard, Settings, Plus, Users } from 'lucide-react-native';
import { AddTransactionSheet } from '@/components/AddTransactionSheet';
import { GlassCard } from '@/components/GlassCard';
import { format } from 'date-fns';

if (Platform.OS !== 'web') {
    WebBrowser.maybeCompleteAuthSession();
}

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
    blue: '#3B82F6',
    indigo: '#6366F1',
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: 16,
        paddingTop: Platform.OS === 'web' ? 24 : 12,
        paddingBottom: 100,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
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
    headerButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    accentButton: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    // Grid
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
    },
    halfCard: {
        flex: 1,
        minWidth: '45%',
    },
    // Cards
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginBottom: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardTitle: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardValue: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
        marginTop: 4,
    },
    cardValueGreen: {
        color: colors.green,
    },
    cardValueRed: {
        color: colors.red,
    },
    cardValueOrange: {
        color: colors.orange,
    },
    cardSubtext: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    // Transactions
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 12,
        marginTop: 8,
    },
    transactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.cardBorder,
    },
    transactionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    transactionIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    transactionIconText: {
        fontSize: 18,
    },
    transactionInfo: {
        flex: 1,
    },
    transactionDesc: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
    },
    transactionDate: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    transactionAmount: {
        fontSize: 14,
        fontWeight: '600',
    },
    amountIncome: {
        color: colors.green,
    },
    amountExpense: {
        color: colors.red,
    },
    // Quick Links
    quickLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginBottom: 8,
    },
    quickLinkLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    quickLinkIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    quickLinkTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
    },
    quickLinkSubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        marginTop: 2,
    },
    // FAB
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
    // Sign In
    signInContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: colors.background,
    },
    signInTitle: {
        fontSize: 32,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    signInSubtitle: {
        fontSize: 16,
        color: colors.textMuted,
        marginBottom: 32,
        textAlign: 'center',
    },
    signInButton: {
        backgroundColor: colors.accent,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 12,
        width: '100%',
    },
    signInButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    // Loading
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
    // Error
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
        padding: 32,
    },
    errorCard: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.red,
        textAlign: 'center',
        marginBottom: 8,
    },
    errorMessage: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: colors.red,
        paddingVertical: 12,
        borderRadius: 12,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});

// ===== CURRENCY FORMATTER =====
const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

// ===== SIGN IN SCREEN =====
const SignInScreen = () => {
    useWarmUpBrowser();
    const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

    const onPress = React.useCallback(async () => {
        try {
            const { createdSessionId, setActive } = await startOAuthFlow();
            if (createdSessionId) {
                setActive?.({ session: createdSessionId });
            }
        } catch (err) {
            console.error("OAuth error", err);
        }
    }, []);

    return (
        <View style={styles.signInContainer}>
            <Text style={styles.signInTitle}>Woolet</Text>
            <Text style={styles.signInSubtitle}>Manage your finances with ease</Text>
            <TouchableOpacity style={styles.signInButton} onPress={onPress}>
                <Text style={styles.signInButtonText}>Sign in with Google</Text>
            </TouchableOpacity>
        </View>
    );
};

// ===== METRIC CARD =====
const MetricCard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    iconColor = colors.textMuted,
    valueStyle
}: {
    title: string;
    value: string;
    subtitle?: string;
    icon: any;
    iconColor?: string;
    valueStyle?: object;
}) => (
    <GlassCard style={styles.halfCard}>
        <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Icon size={18} color={iconColor} />
        </View>
        <Text style={[styles.cardValue, valueStyle]}>{value}</Text>
        {subtitle && <Text style={styles.cardSubtext}>{subtitle}</Text>}
    </GlassCard>
);

// ===== QUICK LINK =====
const QuickLink = ({
    title,
    subtitle,
    icon: Icon,
    iconBg,
    href
}: {
    title: string;
    subtitle: string;
    icon: any;
    iconBg: string;
    href: string;
}) => (
    <Link href={href as any} asChild>
        <TouchableOpacity>
            <GlassCard style={{ marginBottom: 8 }}>
                <View style={styles.quickLinkLeft}>
                    <View style={[styles.quickLinkIcon, { backgroundColor: iconBg }]}>
                        <Icon size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.quickLinkTitle}>{title}</Text>
                        <Text style={styles.quickLinkSubtitle}>{subtitle}</Text>
                    </View>
                    <ArrowRight size={20} color={colors.textSecondary} />
                </View>
            </GlassCard>
        </TouchableOpacity>
    </Link>
);

// ===== DASHBOARD CONTENT =====
const DashboardContent = () => {
    const router = useRouter();
    const { signOut } = useAuth();
    const { data: user, isLoading: userLoading, error, refetch: refetchUser } = trpc.user.me.useQuery();
    const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = trpc.account.getTotalBalance.useQuery();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthStr = startOfMonth.toISOString();

    const { data: incomeData, refetch: refetchIncome } = trpc.transaction.list.useQuery({
        type: 'income',
        startDate: startOfMonthStr,
        limit: 100
    });

    const { data: expenseData, refetch: refetchExpense } = trpc.transaction.list.useQuery({
        type: 'expense',
        startDate: startOfMonthStr,
        limit: 100
    });

    const { data: recentTxData, refetch: refetchRecent } = trpc.transaction.list.useQuery({
        limit: 8,
        hideAdjustments: true
    });

    const { data: debtsData, refetch: refetchDebts } = trpc.debt.list.useQuery({});

    const [refreshing, setRefreshing] = React.useState(false);
    const [showAddTransaction, setShowAddTransaction] = React.useState(false);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            refetchUser(),
            refetchBalance(),
            refetchIncome(),
            refetchExpense(),
            refetchRecent(),
            refetchDebts()
        ]);
        setRefreshing(false);
    }, [refetchUser, refetchBalance, refetchIncome, refetchExpense, refetchRecent, refetchDebts]);

    const monthlyIncome = React.useMemo(() =>
        incomeData?.transactions?.reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0,
        [incomeData]
    );

    const monthlyExpense = React.useMemo(() =>
        expenseData?.transactions?.reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0,
        [expenseData]
    );

    const totalBalance = React.useMemo(() => {
        if (!balanceData?.balances) return 0;
        return Object.values(balanceData.balances).reduce((sum: number, b: any) => sum + Number(b), 0);
    }, [balanceData]);

    const totalDebts = React.useMemo(() => {
        const active = debtsData?.debts?.filter((d: any) => d.status !== 'paid') || [];
        return active.reduce((sum: number, d: any) => sum + (d.type === 'i_owe' ? Number(d.amount) : 0), 0);
    }, [debtsData]);

    const transactions = recentTxData?.transactions || [];

    if (userLoading || balanceLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.errorContainer}>
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Connection Error</Text>
                    <Text style={styles.errorMessage}>{error.message}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
                        <Text style={styles.retryButtonText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
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
                {/* Welcome message */}
                <View style={{ marginBottom: 24 }}>
                    <Text style={styles.headerSubtitle}>
                        Welcome back, {user?.name?.split(' ')[0] || 'User'}
                    </Text>
                </View>

                {/* Metrics Grid */}
                <View style={styles.grid}>
                    <MetricCard
                        title="Total Balance"
                        value={formatCurrency(totalBalance)}
                        subtitle={`${balanceData?.accountCount || 0} accounts`}
                        icon={Wallet}
                        iconColor={colors.accent}
                    />
                    <MetricCard
                        title="Debts"
                        value={formatCurrency(totalDebts)}
                        subtitle="You owe"
                        icon={Users}
                        iconColor={colors.orange}
                        valueStyle={totalDebts > 0 ? styles.cardValueOrange : undefined}
                    />
                </View>
                <View style={styles.grid}>
                    <MetricCard
                        title="Income"
                        value={formatCurrency(monthlyIncome)}
                        subtitle="This month"
                        icon={TrendingUp}
                        iconColor={colors.green}
                        valueStyle={styles.cardValueGreen}
                    />
                    <MetricCard
                        title="Expenses"
                        value={formatCurrency(monthlyExpense)}
                        subtitle="This month"
                        icon={TrendingDown}
                        iconColor={colors.red}
                        valueStyle={styles.cardValueRed}
                    />
                </View>

                {/* Recent Transactions */}
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                <GlassCard>
                    {transactions.length > 0 ? (
                        transactions.slice(0, 6).map((tx: any) => (
                            <View key={tx.id} style={styles.transactionItem}>
                                <View style={styles.transactionLeft}>
                                    <View style={styles.transactionIcon}>
                                        <Text style={styles.transactionIconText}>
                                            {tx.category?.icon || '📄'}
                                        </Text>
                                    </View>
                                    <View style={styles.transactionInfo}>
                                        <Text style={styles.transactionDesc} numberOfLines={1}>
                                            {tx.description || tx.category?.name || 'Transaction'}
                                        </Text>
                                        <Text style={styles.transactionDate}>
                                            {format(new Date(tx.date), 'MMM d')} • {tx.currencyBalance?.account?.name || 'Account'}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={[
                                    styles.transactionAmount,
                                    tx.type === 'income' ? styles.amountIncome : styles.amountExpense
                                ]}>
                                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(Number(tx.amount)), tx.currencyBalance?.currencyCode || 'USD')}
                                </Text>
                            </View>
                        ))
                    ) : (
                        <Text style={[styles.cardSubtext, { textAlign: 'center', paddingVertical: 20 }]}>
                            No recent transactions
                        </Text>
                    )}
                </GlassCard>

                {/* Quick Links */}
                <Text style={styles.sectionTitle}>Quick Access</Text>
                <QuickLink
                    title="Accounts"
                    subtitle="Manage your bank accounts"
                    icon={Landmark}
                    iconBg={colors.green}
                    href="/accounts"
                />
                <QuickLink
                    title="Transactions"
                    subtitle="View spending history"
                    icon={Receipt}
                    iconBg={colors.orange}
                    href="/transactions"
                />
                <QuickLink
                    title="Subscriptions"
                    subtitle="Recurring payments"
                    icon={Calendar}
                    iconBg={colors.indigo}
                    href="/subscriptions"
                />
                <QuickLink
                    title="Debts & Loans"
                    subtitle="Track what you owe"
                    icon={Banknote}
                    iconBg={colors.red}
                    href="/financial/debts"
                />
                <QuickLink
                    title="Deposits"
                    subtitle="Savings and fixed deposits"
                    icon={PiggyBank}
                    iconBg={colors.blue}
                    href="/financial/deposits"
                />
                <QuickLink
                    title="Credits"
                    subtitle="Credit lines and loans"
                    icon={CreditCard}
                    iconBg="#8B5CF6"
                    href="/financial/credits"
                />
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setShowAddTransaction(true)}
            >
                <Plus size={24} color="#fff" />
            </TouchableOpacity>

            <AddTransactionSheet
                open={showAddTransaction}
                onOpenChange={setShowAddTransaction}
            />
        </View>
    );
};

// ===== MAIN EXPORT =====
export default function Dashboard() {
    return (
        <>
            <SignedOut>
                <SignInScreen />
            </SignedOut>
            <SignedIn>
                <DashboardContent />
            </SignedIn>
        </>
    );
}
