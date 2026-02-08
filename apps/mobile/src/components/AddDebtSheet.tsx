import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useForm } from 'react-hook-form';
import { trpc } from '@/utils/trpc';
import { Input } from './ui/input';
import { Button } from './ui/button';
import BottomSheet from './ui/modal';
import { Switch } from 'react-native';
import { CurrencySelector } from './CurrencySelector';

export function AddDebtSheetMobile({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: banks } = trpc.bank.getHierarchy.useQuery();
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: { isExternal: false, personName: '', amount: '', type: 'i_owe', currencyBalanceId: '', currencyCode: '' }
  });

  const currencyOptions = useMemo(() => {
    if (!banks) return [];
    const opts: { id: string; label: string; currencyCode: string }[] = [];
    banks.forEach((bank: any) => bank.accounts.forEach((acc: any) => acc.currencyBalances.forEach((cb: any) => {
      opts.push({ id: cb.id, label: `[${bank.name}] ${acc.name} - ${cb.currencyCode}`, currencyCode: cb.currencyCode });
    })));
    return opts;
  }, [banks]);

  const createDebt = trpc.debt.create.useMutation({
    onSuccess: () => {
      utils.debt.list.invalidate();
      onOpenChange(false);
    }
  });

  const onSubmit = (data: any) => {
    createDebt.mutate({
      isExternal: data.isExternal,
      currencyBalanceId: data.currencyBalanceId || null,
      currencyCode: data.currencyCode || null,
      personName: data.personName,
      amount: Number(data.amount),
      type: data.type,
      description: data.description || undefined,
      dueDate: data.dueDate || undefined,
    });
  };

  return (
    <BottomSheet open={open} onClose={() => onOpenChange(false)}>
      <Text className="text-lg font-semibold mb-3">Add Debt</Text>

      <View className="mb-3">
        <Text className="text-sm font-medium mb-1">Historical (Not tracked)</Text>
        <View className="flex-row items-center justify-between">
          <Switch
            value={watch('isExternal')}
            onValueChange={(val) => setValue('isExternal', val)}
          />
        </View>
      </View>

      {!watch('isExternal') ? (
        <View className="mb-3">
          <Text className="text-sm font-medium mb-1">Account</Text>
          <TouchableOpacity onPress={() => setShowAccountPicker(true)} className="bg-zinc-50 p-3 rounded">
            <Text>{(currencyOptions.find(o => o.id === watch('currencyBalanceId'))?.label) ?? 'Select account'}</Text>
          </TouchableOpacity>

          <BottomSheet open={showAccountPicker} onClose={() => setShowAccountPicker(false)}>
            <Text className="text-md font-semibold mb-3">Select Account</Text>
            <FlatList
              data={currencyOptions}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => { setValue('currencyBalanceId', item.id); setValue('currencyCode', item.currencyCode); setShowAccountPicker(false); }} className="p-3 border-b">
                  <Text>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </BottomSheet>
        </View>
      ) : (
        <View className="mb-3">
          <Text className="text-sm font-medium mb-1 px-1">Currency</Text>
          <CurrencySelector
            value={watch('currencyCode')}
            onValueChange={(val) => setValue('currencyCode', val)}
          />
        </View>
      )}

      <View className="mb-3">
        <Text className="text-sm font-medium mb-1">Person / Entity</Text>
        <Input placeholder="John Doe" onChangeText={(t) => setValue('personName', t)} />
      </View>

      <View className="mb-3">
        <Text className="text-sm font-medium mb-1">Amount</Text>
        <Input keyboardType="numeric" placeholder="0.00" onChangeText={(t) => setValue('amount', t)} />
      </View>

      <View className="mb-4">
        <Button onPress={() => { handleSubmit(onSubmit)(); }}>
          Add Debt
        </Button>
      </View>
    </BottomSheet>
  );
}
