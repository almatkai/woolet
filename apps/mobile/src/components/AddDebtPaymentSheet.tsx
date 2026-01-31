import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useForm } from 'react-hook-form';
import { trpc } from '@/utils/trpc';
import BottomSheet from './ui/modal';
import { Input } from './ui/input';
import { Button } from './ui/button';

export function AddDebtPaymentSheetMobile({ debt, open, onOpenChange }: { debt: any | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: accountsData } = trpc.account.list.useQuery({});

  const { register, handleSubmit, setValue, watch } = useForm({ defaultValues: { amount: '', date: new Date().toISOString().split('T')[0], note: '', currencyBalanceId: '' } });

  useEffect(() => {
    if (!open || !debt) return;
    const remaining = Number(debt.amount) - Number(debt.paidAmount || 0);
    setValue('amount', String(remaining));
    // Try to pick a default account with matching currency
    const debtCurrency = debt.currencyBalance?.currencyCode || debt.currencyCode;
    if (accountsData) {
      for (const acc of accountsData as any[]) {
        const cb = acc.currencyBalances?.find((c: any) => c.currencyCode === debtCurrency);
        if (cb) { setValue('currencyBalanceId', cb.id); break; }
      }
    }
  }, [open, debt, accountsData, setValue]);

  const addPaymentMutation = trpc.debt.addPayment.useMutation({
    onSuccess: () => {
      utils.debt.list.invalidate();
      utils.bank.getHierarchy.invalidate();
      onOpenChange(false);
    }
  });

  const onSubmit = (data: any) => {
    if (!debt) return;
    if (!data.currencyBalanceId) {
      // pick first currency balance in same currency or fail
      const debtCurrency = debt.currencyBalance?.currencyCode || debt.currencyCode;
      const match = (accountsData as any[] || []).flatMap(a => a.currencyBalances || []).find((cb: any) => cb.currencyCode === debtCurrency);
      if (match) data.currencyBalanceId = match.id;
      else {
        alert('Please select a destination account');
        return;
      }
    }

    addPaymentMutation.mutate({ debtId: debt.id, amount: Number(data.amount), paymentDate: data.date, note: data.note, distributions: [{ currencyBalanceId: data.currencyBalanceId, amount: Number(data.amount) }] });
  };

  if (!debt) return null;

  return (
    <BottomSheet open={open} onClose={() => onOpenChange(false)}>
      <Text className="text-lg font-semibold mb-3">Record Repayment</Text>
      <Text className="text-sm text-zinc-500 mb-3">Remaining: {(Number(debt.amount) - Number(debt.paidAmount || 0)).toFixed(2)} {debt.currencyBalance?.currencyCode || debt.currencyCode}</Text>

      <View className="mb-3">
        <Text className="text-sm font-medium mb-1">Amount</Text>
        <Input keyboardType="numeric" placeholder="0.00" onChangeText={(t) => setValue('amount', t)} value={watch('amount')} />
      </View>

      <View className="mb-3">
        <Text className="text-sm font-medium mb-1">Date</Text>
        <Input placeholder="YYYY-MM-DD" onChangeText={(t) => setValue('date', t)} value={watch('date')} />
      </View>

      <View className="mb-3">
        <Text className="text-sm font-medium mb-1">Note</Text>
        <Input placeholder="Optional note" onChangeText={(t) => setValue('note', t)} />
      </View>

      <View className="mb-4">
        <Button onPress={() => { handleSubmit(onSubmit)(); }}>
          Record Payment
        </Button>
      </View>
    </BottomSheet>
  );
}
