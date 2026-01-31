import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { CurrencyDisplay } from './CurrencyDisplay';
import clsx from 'clsx';
import { format } from 'date-fns';
import { TrendingDown, TrendingUp, CreditCard, Banknote, Landmark, ArrowRight, Receipt } from 'lucide-react-native';

interface MobileMetricWidgetProps {
    title: string;
    icon: React.ReactNode;
    value: number;
    subValue?: string;
    color?: string;
    valueColor?: string;
    currency?: string;
}

export const MobileMetricWidget = ({
    title,
    icon,
    value,
    subValue,
    valueColor,
    currency = 'USD'
}: MobileMetricWidgetProps) => (
    <Card className="flex-1 bg-white border border-zinc-100 shadow-sm">
        <CardHeader className="flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{title}</CardTitle>
            <View className="opacity-60">{icon}</View>
        </CardHeader>
        <CardContent className="p-3 pt-0">
            <CurrencyDisplay
                amount={value}
                currency={currency}
                className={clsx("text-xl font-bold text-zinc-900", valueColor)}
            />
            {subValue && (
                <Text className="text-zinc-400 text-[10px] mt-0.5 truncate">{subValue}</Text>
            )}
        </CardContent>
    </Card>
);

interface Transaction {
    id: string;
    amount: string | number;
    description?: string | null;
    date: string;
    type: string;
    category?: {
        name: string;
        icon: string;
    } | null;
    currencyBalance?: {
        currencyCode: string;
        account?: {
            name: string;
        } | null;
    };
}

export const MobileTransactionsWidget = ({ transactions }: { transactions: Transaction[] }) => (
    <Card className="bg-white border border-zinc-100 shadow-sm">
        <CardHeader className="p-4 pb-2">
            <View className="flex-row justify-between items-center">
                <View>
                    <CardTitle className="text-lg font-bold text-zinc-900">Recent Activity</CardTitle>
                    <CardDescription className="text-zinc-500 text-xs mt-1">Your latest financial movements</CardDescription>
                </View>
                <View className="bg-zinc-100 p-2 rounded-full">
                    <Receipt size={16} className="text-zinc-900" />
                </View>
            </View>
        </CardHeader>
        <CardContent className="p-4 pt-2">
            <View className="space-y-4">
                {transactions.length > 0 ? (
                    transactions.map((tx) => (
                        <View key={tx.id} className="flex-row items-center justify-between">
                            <View className="flex-row items-center gap-3">
                                <View className="h-10 w-10 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100">
                                    <Text className="text-lg">{tx.category?.icon || '📄'}</Text>
                                </View>
                                <View className="max-w-[150px]">
                                    <Text className="text-sm font-semibold text-zinc-900 truncate" numberOfLines={1}>
                                        {tx.description || tx.category?.name || 'Unknown'}
                                    </Text>
                                    <Text className="text-[10px] text-zinc-400 mt-0.5">
                                        {format(new Date(tx.date), 'MMM d')} • {tx.currencyBalance?.account?.name || 'Account'}
                                    </Text>
                                </View>
                            </View>
                            <View className="items-end">
                                <CurrencyDisplay
                                    amount={tx.type === 'expense' ? -Math.abs(Number(tx.amount)) : Number(tx.amount)}
                                    currency={tx.currencyBalance?.currencyCode || 'USD'}
                                    className={clsx(
                                        "text-sm font-bold",
                                        tx.type === 'income' ? 'text-emerald-600' : tx.type === 'expense' ? 'text-rose-600' : 'text-zinc-900'
                                    )}
                                />
                            </View>
                        </View>
                    ))
                ) : (
                    <Text className="text-zinc-400 text-center py-4 text-xs italic">No recent transactions</Text>
                )}
            </View>
        </CardContent>
    </Card>
);

export const FinancialSummaryCard = ({
    title,
    icon: Icon,
    amount,
    colorClasses,
    onPress
}: {
    title: string;
    icon: any;
    amount: number;
    colorClasses: string;
    onPress?: () => void;
}) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} className="flex-1">
        <View className={clsx("p-4 rounded-2xl border flex-col justify-between h-32 shadow-sm", colorClasses)}>
            <View className="flex-row justify-between items-start">
                <View className="p-2.5 rounded-xl bg-white/20">
                    <Icon size={20} color="white" />
                </View>
                <ArrowRight size={16} color="white" />
            </View>
            <View>
                <Text className="text-white/70 text-[11px] font-medium uppercase tracking-wider">{title}</Text>
                <CurrencyDisplay amount={amount} className="text-xl font-bold text-white mt-1" />
            </View>
        </View>
    </TouchableOpacity>
);
