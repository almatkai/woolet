import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { trpc } from '@/utils/trpc';
import { Input } from './ui/input';
import { Button } from './ui/button';
import BottomSheet from './ui/modal';
import clsx from 'clsx';

const ACCOUNT_TYPES = ['checking', 'savings', 'card', 'crypto', 'investment', 'cash'];

export function AddAccountSheet({ open, onOpenChange, bankId, bankName }: { open: boolean; onOpenChange: (open: boolean) => void; bankId: string; bankName: string }) {
    const utils = trpc.useUtils();

    const { control, handleSubmit, reset, setValue, watch } = useForm({
        defaultValues: {
            name: '',
            type: 'checking' as any,
            icon: '💳'
        }
    });

    const selectedType = watch('type');

    const createAccount = trpc.account.create.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            reset();
            onOpenChange(false);
        }
    });

    const onSubmit = (data: any) => {
        createAccount.mutate({
            bankId,
            ...data
        });
    };

    return (
        <BottomSheet open={open} onClose={() => onOpenChange(false)}>
            <Text className="text-xl font-bold mb-2 text-white">Add Account</Text>
            <Text className="text-zinc-400 mb-6">Create a new account in {bankName}.</Text>

            <ScrollView>
                <View className="mb-4">
                    <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Account Name</Text>
                    <Controller
                        control={control}
                        name="name"
                        rules={{ required: true }}
                        render={({ field: { onChange, value } }) => (
                            <Input
                                placeholder="e.g. Daily Spending"
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                </View>

                <View className="mb-6">
                    <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Account Type</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {ACCOUNT_TYPES.map((t) => (
                            <TouchableOpacity
                                key={t}
                                onPress={() => setValue('type', t)}
                                className={clsx(
                                    "px-3 py-2 rounded-lg border",
                                    selectedType === t ? "bg-zinc-700 border-zinc-700" : "bg-zinc-800 border-zinc-700"
                                )}
                            >
                                <Text className={clsx("capitalize", selectedType === t ? "text-white" : "text-zinc-400")}>
                                    {t}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <Button onPress={handleSubmit(onSubmit)} className="mb-6">
                    Create Account
                </Button>
            </ScrollView>
        </BottomSheet>
    );
}
