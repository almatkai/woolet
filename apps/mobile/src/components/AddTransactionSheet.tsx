import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { trpc } from '@/utils/trpc';
import { Input } from './ui/input';
import { Button } from './ui/button';
import BottomSheet from './ui/modal';
import { Switch } from 'react-native';
import clsx from 'clsx';
import { Receipt, Search } from 'lucide-react-native';

export function AddTransactionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: banks } = trpc.bank.getHierarchy.useQuery();
  const { data: categories } = trpc.category.list.useQuery();

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const { control, handleSubmit, setValue, watch, reset } = useForm({
    defaultValues: {
      type: 'expense' as 'income' | 'expense' | 'transfer',
      amount: '',
      description: '',
      currencyBalanceId: '',
      categoryId: '',
      toCurrencyBalanceId: '',
      date: new Date().toISOString().split('T')[0]
    }
  });

  const type = watch('type');

  const currencyOptions = useMemo(() => {
    if (!banks) return [];
    const opts: { id: string; label: string; currencyCode: string }[] = [];
    banks.forEach((bank: any) => bank.accounts.forEach((acc: any) => acc.currencyBalances.forEach((cb: any) => {
      opts.push({ id: cb.id, label: `[${bank.name}] ${acc.name} - ${cb.currencyCode}`, currencyCode: cb.currencyCode });
    })));
    return opts;
  }, [banks]);

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (type === 'transfer') return [];
    return categories.filter(c => !c.type || c.type === type);
  }, [categories, type]);

  const createTransaction = trpc.transaction.create.useMutation({
    onSuccess: () => {
      utils.transaction.list.invalidate();
      utils.bank.getHierarchy.invalidate();
      utils.user.me.invalidate();
      reset();
      onOpenChange(false);
    }
  });

  const onSubmit = (data: any) => {
    createTransaction.mutate({
      type: data.type,
      amount: Number(data.amount),
      description: data.description || undefined,
      currencyBalanceId: data.currencyBalanceId,
      categoryId: data.categoryId || undefined,
      toCurrencyBalanceId: data.type === 'transfer' ? data.toCurrencyBalanceId : undefined,
      date: new Date(data.date).toISOString(),
    });
  };

  return (
    <BottomSheet open={open} onClose={() => onOpenChange(false)}>
      <Text className="text-xl font-bold mb-4 text-white">Add Transaction</Text>

      {/* Type Selector */}
      <View className="flex-row mb-4 bg-zinc-800 p-1 rounded-lg">
        {['expense', 'income', 'transfer'].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => {
              setValue('type', t as any);
              setValue('categoryId', '');
            }}
            className={clsx(
              "flex-1 py-2 rounded-md items-center",
              type === t ? "bg-zinc-700 shadow-sm" : ""
            )}
          >
            <Text className={clsx("capitalize font-medium", type === t ? "text-white" : "text-zinc-400")}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView className="max-h-[500px]">
        {/* Amount */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Amount</Text>
          <Controller
            control={control}
            name="amount"
            rules={{ required: true }}
            render={({ field: { onChange, value } }) => (
              <Input
                placeholder="0.00"
                keyboardType="numeric"
                className="text-2xl font-bold py-4"
                onChangeText={onChange}
                value={value}
              />
            )}
          />
        </View>

        {/* Account Selection */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">
            {type === 'transfer' ? 'From Account' : 'Account'}
          </Text>
          <TouchableOpacity
            onPress={() => setShowAccountPicker(true)}
            className="bg-[#111827] p-4 rounded-lg border border-zinc-800"
          >
            <Text className={watch('currencyBalanceId') ? "text-white" : "text-zinc-500"}>
              {(currencyOptions.find(o => o.id === watch('currencyBalanceId'))?.label) ?? 'Select account'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* To Account (for transfers) */}
        {type === 'transfer' && (
          <View className="mb-4">
            <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">To Account</Text>
            <TouchableOpacity
              onPress={() => setShowToAccountPicker(true)}
              className="bg-[#111827] p-4 rounded-lg border border-zinc-800"
            >
              <Text className={watch('toCurrencyBalanceId') ? "text-white" : "text-zinc-500"}>
                {(currencyOptions.find(o => o.id === watch('toCurrencyBalanceId'))?.label) ?? 'Select destination'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Category (not for transfers) */}
        {type !== 'transfer' && (
          <View className="mb-4">
            <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Category</Text>
            <TouchableOpacity
              onPress={() => setShowCategoryPicker(true)}
              className="bg-[#111827] p-4 rounded-lg border border-zinc-800"
            >
              <View className="flex-row items-center">
                {watch('categoryId') ? (
                  <>
                    <Text className="mr-2 text-lg">
                      {categories?.find(c => c.id === watch('categoryId'))?.icon}
                    </Text>
                    <Text className="text-white">
                      {categories?.find(c => c.id === watch('categoryId'))?.name}
                    </Text>
                  </>
                ) : (
                  <Text className="text-zinc-500">Select category</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Description</Text>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, value } }) => (
              <Input
                placeholder="What was this for?"
                onChangeText={onChange}
                value={value}
              />
            )}
          />
        </View>

        {/* Date */}
        <View className="mb-6">
          <Text className="text-sm font-medium mb-1 text-zinc-500 uppercase tracking-wider">Date</Text>
          <Controller
            control={control}
            name="date"
            render={({ field: { onChange, value } }) => (
              <Input
                placeholder="YYYY-MM-DD"
                onChangeText={onChange}
                value={value}
              />
            )}
          />
        </View>

        <Button onPress={handleSubmit(onSubmit)} className="mb-6">
          Create Transaction
        </Button>
      </ScrollView>

      {/* Sub-pickers */}
      <BottomSheet open={showAccountPicker} onClose={() => setShowAccountPicker(false)}>
        <Text className="text-lg font-bold mb-4 text-white">Select Account</Text>
        <FlatList
          data={currencyOptions}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { setValue('currencyBalanceId', item.id); setShowAccountPicker(false); }}
              className="p-4 border-b border-zinc-800 flex-row justify-between items-center"
            >
              <Text className="text-white">{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </BottomSheet>

      <BottomSheet open={showToAccountPicker} onClose={() => setShowToAccountPicker(false)}>
        <Text className="text-lg font-bold mb-4 text-white">Select Destination Account</Text>
        <FlatList
          data={currencyOptions.filter(o => o.id !== watch('currencyBalanceId'))}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { setValue('toCurrencyBalanceId', item.id); setShowToAccountPicker(false); }}
              className="p-4 border-b border-zinc-800 flex-row justify-between items-center"
            >
              <Text className="text-white">{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </BottomSheet>

      <BottomSheet open={showCategoryPicker} onClose={() => setShowCategoryPicker(false)}>
        <Text className="text-lg font-bold mb-4 text-white">Select Category</Text>
        <FlatList
          data={filteredCategories}
          keyExtractor={(it) => it.id}
          numColumns={4}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { setValue('categoryId', item.id); setShowCategoryPicker(false); }}
              className="flex-1 items-center p-4"
            >
              <View className="w-12 h-12 bg-zinc-800 rounded-full items-center justify-center mb-1">
                <Text className="text-2xl">{item.icon}</Text>
              </View>
              <Text className="text-[10px] text-zinc-400 text-center" numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      </BottomSheet>
    </BottomSheet>
  );
}
