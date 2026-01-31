import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { trpc } from '@/utils/trpc';
import { Input } from './ui/input';
import { Button } from './ui/button';
import BottomSheet from './ui/modal';
import clsx from 'clsx';

const typeIcons: Record<string, { icon: string; color: string }> = {
    mobile: { icon: '📱', color: '#3b82f6' },
    general: { icon: '🔄', color: '#6366f1' },
    credit: { icon: '💳', color: '#ef4444' },
    mortgage: { icon: '🏠', color: '#10b981' },
};

export function AddSubscriptionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const utils = trpc.useUtils();

    const { control, handleSubmit, reset, setValue, watch } = useForm({
        defaultValues: {
            name: '',
            type: 'general' as 'mobile' | 'general' | 'credit' | 'mortgage',
            amount: '',
            currency: 'USD',
            frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
            startDate: new Date().toISOString().split('T')[0],
            icon: '🔄',
            color: '#6366f1',
        }
    });

    const selectedType = watch('type');
    const selectedFreq = watch('frequency');

    useEffect(() => {
        if (selectedType && typeIcons[selectedType]) {
            setValue('icon', typeIcons[selectedType].icon);
            setValue('color', typeIcons[selectedType].color);
        }
    }, [selectedType, setValue]);

    const createMutation = trpc.subscription.create.useMutation({
        onSuccess: () => {
            utils.subscription.list.invalidate();
            utils.subscription.getUpcoming.invalidate();
            reset();
            onOpenChange(false);
        }
    });

    const onSubmit = (data: any) => {
        createMutation.mutate({
            ...data,
            amount: Number(data.amount),
        });
    };

    return (
        <BottomSheet open={open} onClose={() => onOpenChange(false)}>
            <Text className="text-2xl font-bold mb-6 text-white text-center">Add Subscription</Text>

            <ScrollView className="max-h-[600px]" showsVerticalScrollIndicator={false}>
                {/* Name */}
                <View className="mb-4">
                    <Text className="text-xs font-bold mb-2 text-zinc-400 uppercase tracking-widest px-1">Subscription Name</Text>
                    <Controller
                        control={control}
                        name="name"
                        rules={{ required: true }}
                        render={({ field: { onChange, value } }) => (
                            <Input
                                placeholder="e.g. Netflix, Spotify"
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                </View>

                {/* Amount */}
                <View className="mb-4">
                    <Text className="text-xs font-bold mb-2 text-zinc-400 uppercase tracking-widest px-1">Amount</Text>
                    <Controller
                        control={control}
                        name="amount"
                        rules={{ required: true }}
                        render={({ field: { onChange, value } }) => (
                            <Input
                                placeholder="0.00"
                                keyboardType="numeric"
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                </View>

                {/* Type Selection */}
                <View className="mb-4">
                    <Text className="text-xs font-bold mb-2 text-zinc-400 uppercase tracking-widest px-1">Type</Text>
                    <View className="flex-row flex-wrap gap-2 px-1">
                        {Object.keys(typeIcons).map((t) => (
                            <TouchableOpacity
                                key={t}
                                activeOpacity={0.7}
                                onPress={() => setValue('type', t as any)}
                                className={clsx(
                                    "px-4 py-2.5 rounded-xl border flex-row items-center",
                                    selectedType === t ? "bg-indigo-600 border-indigo-600" : "bg-zinc-800 border-zinc-700"
                                )}
                            >
                                <Text className="mr-2 text-lg">{typeIcons[t].icon}</Text>
                                <Text className={clsx("capitalize font-semibold", selectedType === t ? "text-white" : "text-zinc-300")}>
                                    {t}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Frequency */}
                <View className="mb-4">
                    <Text className="text-xs font-bold mb-2 text-zinc-400 uppercase tracking-widest px-1">Frequency</Text>
                    <View className="flex-row flex-wrap gap-2 px-1">
                        {['daily', 'weekly', 'monthly', 'yearly'].map((f) => (
                            <TouchableOpacity
                                key={f}
                                activeOpacity={0.7}
                                onPress={() => setValue('frequency', f as any)}
                                className={clsx(
                                    "px-4 py-2.5 rounded-xl border",
                                    selectedFreq === f ? "bg-indigo-600 border-indigo-600" : "bg-zinc-800 border-zinc-700"
                                )}
                            >
                                <Text className={clsx("capitalize font-semibold", selectedFreq === f ? "text-white" : "text-zinc-300")}>
                                    {f}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Start Date */}
                <View className="mb-8">
                    <Text className="text-xs font-bold mb-2 text-zinc-400 uppercase tracking-widest px-1">Start Date</Text>
                    <Controller
                        control={control}
                        name="startDate"
                        render={({ field: { onChange, value } }) => (
                            <Input
                                placeholder="YYYY-MM-DD"
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                </View>

                <Button onPress={handleSubmit(onSubmit)} className="mb-10 bg-indigo-600 py-4 h-auto">
                    Add Subscription
                </Button>
            </ScrollView>
        </BottomSheet>
    );
}
