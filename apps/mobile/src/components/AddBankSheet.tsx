import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { trpc } from '@/utils/trpc';
import { Input } from './ui/input';
import { Button } from './ui/button';
import BottomSheet from './ui/modal';
import { Landmark } from 'lucide-react-native';

const ICONS = ['Landmark', 'CreditCard', 'Wallet', 'PiggyBank', 'Banknote', 'Coins', 'Briefcase', 'LineChart'];

export function AddBankSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const utils = trpc.useUtils();
    const [showIconPicker, setShowIconPicker] = useState(false);

    const { control, handleSubmit, setValue, watch, reset } = useForm({
        defaultValues: {
            name: '',
            color: '#18181b',
            icon: 'Landmark',
        }
    });

    const createBank = trpc.bank.create.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            reset();
            onOpenChange(false);
        }
    });

    const onSubmit = (data: any) => {
        createBank.mutate(data);
    };

    return (
        <BottomSheet open={open} onClose={() => onOpenChange(false)}>
            <Text className="text-xl font-bold mb-4 text-white">Add Institution</Text>
            <Text className="text-zinc-400 mb-6">Add a bank or brokerage (e.g. Chase, Interactive Brokers).</Text>

            <ScrollView>
                <View className="mb-4">
                    <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Institution Name</Text>
                    <Controller
                        control={control}
                        name="name"
                        rules={{ required: true }}
                        render={({ field: { onChange, value } }) => (
                            <Input
                                placeholder="e.g. Interactive Brokers"
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Icon</Text>
                    <TouchableOpacity
                        onPress={() => setShowIconPicker(true)}
                        className="bg-[#111827] p-4 rounded-lg border border-zinc-800 flex-row items-center"
                    >
                        <Landmark size={20} className="text-white mr-2" />
                        <Text className="text-white">{watch('icon')}</Text>
                    </TouchableOpacity>
                </View>

                <View className="mb-6">
                    <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Color (Hex)</Text>
                    <Controller
                        control={control}
                        name="color"
                        render={({ field: { onChange, value } }) => (
                            <Input
                                placeholder="#18181b"
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                </View>

                <Button onPress={handleSubmit(onSubmit)} className="mb-6">
                    Create Institution
                </Button>
            </ScrollView>

            <BottomSheet open={showIconPicker} onClose={() => setShowIconPicker(false)}>
                <Text className="text-lg font-bold mb-4 text-white">Select Icon</Text>
                <FlatList
                    data={ICONS}
                    keyExtractor={(it) => it}
                    numColumns={3}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => { setValue('icon', item); setShowIconPicker(false); }}
                            className="flex-1 items-center p-4 border border-zinc-800 rounded-lg m-1"
                        >
                            <Text className="text-white font-medium">{item}</Text>
                        </TouchableOpacity>
                    )}
                />
            </BottomSheet>
        </BottomSheet>
    );
}
