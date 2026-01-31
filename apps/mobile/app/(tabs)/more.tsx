import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import {
    Users,
    CalendarClock,
    CreditCard,
    Home,
    PiggyBank,
    Settings,
    LogOut,
    ChevronRight,
} from 'lucide-react-native';

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
        paddingBottom: 100,
    },
    header: {
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
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
        marginTop: 8,
    },
    menuItem: {
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
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuItemIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    menuItemTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
    },
    menuItemSubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        marginTop: 2,
    },
    dangerItem: {
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    dangerTitle: {
        color: colors.red,
    },
    versionText: {
        textAlign: 'center',
        color: colors.textSecondary,
        fontSize: 12,
        marginTop: 24,
    },
});

interface MenuItem {
    title: string;
    subtitle: string;
    icon: any;
    iconBg: string;
    route?: string;
    onPress?: () => void;
    danger?: boolean;
}

export default function MoreScreen() {
    const router = useRouter();
    const { signOut } = useAuth();

    const financialItems: MenuItem[] = [
        {
            title: 'Debts & Loans',
            subtitle: 'Track who owes you',
            icon: Users,
            iconBg: colors.red,
            route: '/financial/debts',
        },
        {
            title: 'Subscriptions',
            subtitle: 'Recurring payments',
            icon: CalendarClock,
            iconBg: colors.indigo,
            route: '/subscriptions',
        },
        {
            title: 'Credits',
            subtitle: 'Credit lines',
            icon: CreditCard,
            iconBg: colors.accent,
            route: '/financial/credits',
        },
        {
            title: 'Mortgages',
            subtitle: 'Home loans',
            icon: Home,
            iconBg: colors.blue,
            route: '/financial/mortgages',
        },
        {
            title: 'Deposits',
            subtitle: 'Savings and fixed',
            icon: PiggyBank,
            iconBg: colors.green,
            route: '/financial/deposits',
        },
    ];

    const settingsItems: MenuItem[] = [
        {
            title: 'Settings',
            subtitle: 'Preferences & data',
            icon: Settings,
            iconBg: colors.textSecondary,
            route: '/settings',
        },
        {
            title: 'Sign Out',
            subtitle: 'Logout of your account',
            icon: LogOut,
            iconBg: colors.red,
            onPress: () => signOut(),
            danger: true,
        },
    ];

    const handlePress = (item: MenuItem) => {
        if (item.onPress) {
            item.onPress();
        } else if (item.route) {
            router.push(item.route as any);
        }
    };

    const renderMenuItem = (item: MenuItem) => (
        <TouchableOpacity
            key={item.title}
            style={[styles.menuItem, item.danger && styles.dangerItem]}
            onPress={() => handlePress(item)}
        >
            <View style={styles.menuItemLeft}>
                <View style={[styles.menuItemIcon, { backgroundColor: item.iconBg }]}>
                    <item.icon size={20} color="#fff" />
                </View>
                <View>
                    <Text style={[styles.menuItemTitle, item.danger && styles.dangerTitle]}>
                        {item.title}
                    </Text>
                    <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                </View>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>More</Text>
                    <Text style={styles.headerSubtitle}>Financial products & settings</Text>
                </View>

                <Text style={styles.sectionTitle}>Financial Products</Text>
                {financialItems.map(renderMenuItem)}

                <Text style={styles.sectionTitle}>Account</Text>
                {settingsItems.map(renderMenuItem)}

                <Text style={styles.versionText}>Woo-Let Mobile v1.0.0</Text>
            </ScrollView>
        </View>
    );
}
