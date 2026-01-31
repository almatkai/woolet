import React from 'react';
import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LayoutDashboard, Receipt, Wallet, TrendingUp, Menu, Settings } from 'lucide-react-native';
import { Link } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '@/components/GlassCard';
import { BlurView } from 'expo-blur';

const colors = {
    background: '#111827',
    tabBar: '#1F2937',
    tabBarBorder: '#374151',
    active: '#8B5CF6',
    inactive: '#6B7280',
};

export default function TabsLayout() {
    const insets = useSafeAreaInsets();

    return (
        <Tabs
            screenOptions={{
                headerShadowVisible: false,
                headerLargeTitle: Platform.OS === 'ios',
                headerLargeTitleStyle: {
                    color: '#F9FAFB',
                },
                headerStyle: {
                    backgroundColor: colors.background,
                },
                headerTintColor: '#F9FAFB',
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
                tabBarStyle: {
                    position: 'absolute',
                    backgroundColor: 'transparent',
                    borderTopWidth: 0,
                    elevation: 0,
                    shadowOpacity: 0,
                    height: Platform.OS === 'ios' ? 88 : 60,
                    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
                    paddingTop: 12,
                },
                tabBarBackground: () => (
                    <GlassCard
                        style={{
                            ...StyleSheet.absoluteFillObject,
                            borderTopLeftRadius: 20,
                            borderTopRightRadius: 20,
                            borderRadius: 0,
                        }}
                        intensity={85}
                        borderRadius={0}
                        showBorder={false}
                        padding={0}
                    />
                ),
                tabBarActiveTintColor: colors.active,
                tabBarInactiveTintColor: colors.inactive,
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color, size }) => (
                        <LayoutDashboard size={size} color={color} />
                    ),
                    headerTitle: 'Dashboard',
                    headerRight: () => (
                        <Link href="/settings" asChild>
                            <TouchableOpacity style={{ marginRight: 16 }}>
                                <Settings size={22} color="#F9FAFB" />
                            </TouchableOpacity>
                        </Link>
                    ),
                }}
            />
            <Tabs.Screen
                name="spending"
                options={{
                    title: 'Spending',
                    tabBarIcon: ({ color, size }) => (
                        <Receipt size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="accounts"
                options={{
                    title: 'Accounts',
                    tabBarIcon: ({ color, size }) => (
                        <Wallet size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="investing"
                options={{
                    title: 'Investing',
                    tabBarIcon: ({ color, size }) => (
                        <TrendingUp size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="more"
                options={{
                    title: 'More',
                    tabBarIcon: ({ color, size }) => (
                        <Menu size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
