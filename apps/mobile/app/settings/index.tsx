import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Share, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { trpc } from '@/utils/trpc';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Trash2, Download, AlertTriangle } from 'lucide-react-native';
import { ScreenWrapper } from '@/components/ScreenWrapper';

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
        paddingBottom: 100, // Match subscriptions page
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20, // Match subscriptions page (was 24)
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
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        padding: 16, // Match subscriptions page (was 20)
        marginBottom: 10, // Match subscriptions page (was 16)
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 4,
    },
    cardTitleRed: {
        color: colors.red,
    },
    cardDescription: {
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: 16,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    settingLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.text,
    },
    settingHint: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        padding: 14,
        borderRadius: 12,
        marginBottom: 8,
    },
    actionButtonRed: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    actionIcon: {
        marginRight: 12,
    },
    actionText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.text,
    },
    actionTextRed: {
        color: colors.red,
    },
    warningBox: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        padding: 14,
        borderRadius: 12,
        flexDirection: 'row',
    },
    warningText: {
        flex: 1,
        marginLeft: 12,
    },
    warningTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.orange,
    },
    warningHint: {
        fontSize: 12,
        color: colors.orange,
        opacity: 0.8,
        marginTop: 2,
    },
    versionText: {
        textAlign: 'center',
        color: colors.textSecondary,
        fontSize: 12,
        marginTop: 24,
    },
});

export default function SettingsScreen() {
    const router = useRouter();
    const { data: user } = trpc.user.me.useQuery();
    const utils = trpc.useUtils();

    const updateUserMutation = trpc.user.update.useMutation({
        onSuccess: () => {
            utils.user.me.invalidate();
            Alert.alert('Success', 'Settings updated');
        },
    });

    const deleteAllDataMutation = trpc.user.deleteAllData.useMutation({
        onSuccess: () => {
            utils.invalidate();
            Alert.alert('Success', 'All data has been deleted');
            router.replace('/');
        },
        onError: (error) => {
            Alert.alert('Error', error.message || 'Failed to delete data');
        },
    });

    const handleTestModeToggle = (checked: boolean) => {
        updateUserMutation.mutate({ testMode: checked });
    };

    const handleDeleteAllData = () => {
        Alert.alert(
            'Delete All Data',
            'Are you sure you want to delete all your data? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Everything',
                    style: 'destructive',
                    onPress: () => deleteAllDataMutation.mutate(),
                },
            ]
        );
    };

    const handleExport = async () => {
        try {
            // Use tRPC fetchQuery for data export
            const exportQuery = trpc.useUtils();
            Alert.alert('Export', 'Data export is available on the web version.');
        } catch (error) {
            Alert.alert('Error', 'Failed to export data');
        }
    };

    return (
        <ScreenWrapper style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
                    >
                        <ArrowLeft size={20} color={colors.text} />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>Settings</Text>
                        <Text style={styles.headerSubtitle}>Preferences & data</Text>
                    </View>
                </View>

                {/* Preferences */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Preferences</Text>
                    <Text style={styles.cardDescription}>Customize your experience</Text>
                    <View style={styles.settingRow}>
                        <View>
                            <Text style={styles.settingLabel}>Test Mode</Text>
                            <Text style={styles.settingHint}>Enable experimental features</Text>
                        </View>
                        <Switch
                            value={user?.testMode || false}
                            onValueChange={handleTestModeToggle}
                            trackColor={{ false: colors.cardBorder, true: colors.accent }}
                            thumbColor="#fff"
                        />
                    </View>
                </View>

                {/* Data Management */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Data Management</Text>
                    <Text style={styles.cardDescription}>Export or import your data</Text>
                    <TouchableOpacity style={styles.actionButton} onPress={handleExport}>
                        <Download size={20} color={colors.textMuted} style={styles.actionIcon} />
                        <Text style={styles.actionText}>Export Data (JSON)</Text>
                    </TouchableOpacity>
                    <View style={styles.warningBox}>
                        <AlertTriangle size={20} color={colors.orange} />
                        <View style={styles.warningText}>
                            <Text style={styles.warningTitle}>Import Data</Text>
                            <Text style={styles.warningHint}>Import is only available on the web version.</Text>
                        </View>
                    </View>
                </View>

                {/* Danger Zone */}
                <View style={[styles.card, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                    <Text style={[styles.cardTitle, styles.cardTitleRed]}>Danger Zone</Text>
                    <Text style={styles.cardDescription}>Irreversible actions</Text>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.actionButtonRed]}
                        onPress={handleDeleteAllData}
                    >
                        <Trash2 size={20} color={colors.red} style={styles.actionIcon} />
                        <Text style={[styles.actionText, styles.actionTextRed]}>Delete All Data</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.versionText}>Woo-Let Mobile v1.0.0</Text>
            </ScrollView>
        </ScreenWrapper>
    );
}
