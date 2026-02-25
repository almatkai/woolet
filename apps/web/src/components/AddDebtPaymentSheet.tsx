import { useState, useMemo, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '@/components/ui/sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Debt {
    id: string;
    personName: string;
    amount: string | number;
    type: 'i_owe' | 'they_owe';
    paidAmount?: string | number | null;
    currencyCode?: string | null;
    currencyBalance: {
        currencyCode: string;
    } | null;
}

interface AddDebtPaymentSheetProps {
    debt: Debt | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const distributionSchema = z.object({
    currencyBalanceId: z.string().min(1, "Account required"),
    amount: z.number().min(0.01, "Amount must be greater than 0"),
});

const paymentSchema = z.object({
    amount: z.number().positive("Amount must be positive"),
    date: z.string().min(1, "Date required"),
    note: z.string().optional(),
    isSplit: z.boolean(),
    distributions: z.array(distributionSchema).min(1),
});

type PaymentForm = z.infer<typeof paymentSchema>;

export function AddDebtPaymentSheet({ debt, open, onOpenChange }: AddDebtPaymentSheetProps) {
    const utils = trpc.useUtils();
    const { data: accountsData } = trpc.account.list.useQuery({});

    // Filter accounts that have the matching currency balance
    const availableAccounts = useMemo(() => {
        if (!debt || !accountsData) return [];
        const debtCurrencyCode = debt.currencyBalance?.currencyCode || debt.currencyCode;
        if (!debtCurrencyCode) return [];

        return (accountsData as any[]).flatMap(acc =>
            (acc.currencyBalances as any[])
                .filter((cb: any) => cb.currencyCode === debtCurrencyCode)
                .map((cb: any) => ({
                    id: cb.id,
                    label: `[${acc.bank?.name || 'Unknown'}] ${acc.name}`,
                    balance: Number(cb.balance),
                    currencyCode: cb.currencyCode
                }))
        );
    }, [debt, accountsData]);

    const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<PaymentForm>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            amount: 0,
            date: new Date().toISOString().split('T')[0],
            isSplit: false,
            distributions: [{ currencyBalanceId: '', amount: 0 }],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "distributions"
    });

    // When the sheet opens, set the default payment amount to remaining debt
    useEffect(() => {
        if (!open || !debt) return;
        const remaining = Number(debt.amount) - Number(debt.paidAmount || 0);
        const today = new Date().toISOString().split('T')[0];
        reset({
            amount: remaining,
            date: today,
            isSplit: false,
            distributions: [{ currencyBalanceId: '', amount: remaining }],
            note: ''
        });
        // Ensure individual fields are in sync
        setValue('amount', remaining);
        setValue('distributions.0.amount', remaining);
    }, [open, debt, reset, setValue]);

    const isSplit = watch('isSplit');
    const totalAmount = watch('amount');
    const firstDistId = watch('distributions.0.currencyBalanceId');
    const selectedAccount = useMemo(() =>
        availableAccounts.find(o => o.id === firstDistId),
        [availableAccounts, firstDistId]);

    const addPaymentMutation = trpc.debt.addPayment.useMutation({
        onSuccess: () => {
            toast.success('Payment recorded successfully');
            utils.debt.list.invalidate();
            utils.bank.getHierarchy.invalidate();
            utils.account.getTotalBalance.invalidate();
            onOpenChange(false);
            reset();
        },
        onError: (error: any) => {
            toast.error(error.message);
        }
    });

    const onSubmit = (data: PaymentForm) => {
        if (!debt) return;

        let finalDistributions = data.distributions;

        if (!data.isSplit) {
            // If not split, use the first distribution but ensure amount matches total
            // Also user might not have selected account if they just typed total amount?
            // Wait, we need at least one destination.
            if (data.distributions.length === 0 || !data.distributions[0].currencyBalanceId) {
                toast.error("Please select an account");
                return;
            }
            finalDistributions = [{
                currencyBalanceId: data.distributions[0].currencyBalanceId,
                amount: data.amount
            }];
        } else {
            // Validate sum
            const sum = data.distributions.reduce((acc, curr) => acc + curr.amount, 0);
            if (Math.abs(sum - data.amount) > 0.01) {
                toast.error(`Allocated amount (${sum}) does not match total payment (${data.amount})`);
                return;
            }
        }

        addPaymentMutation.mutate({
            debtId: debt.id,
            amount: data.amount,
            paymentDate: data.date,
            note: data.note,
            distributions: finalDistributions
        });
    };

    if (!debt) return null;

    const remainingDebt = Number(debt.amount) - Number(debt.paidAmount || 0);
    const isIncomingRepayment = debt.type === 'they_owe';
    const accountLabel = isIncomingRepayment ? 'Destination Account' : 'Payment Account';
    const repaymentDirection = isIncomingRepayment ? 'from' : 'to';

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-[500px]">
                <SheetHeader>
                    <SheetTitle>Record Repayment</SheetTitle>
                    <SheetDescription>
                        Record a payment {repaymentDirection} {debt.personName}. Remaining: {remainingDebt.toFixed(2)} {debt.currencyBalance?.currencyCode || debt.currencyCode}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-6">
                    <div className="space-y-2">
                        <Label>Payment Amount</Label>
                        <Input
                            type="number"
                            step="0.01"
                            {...register('amount', { valueAsNumber: true })}
                        />
                        {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Date</Label>
                        <Input type="date" {...register('date')} />
                    </div>

                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={isSplit}
                            onCheckedChange={(checked) => setValue('isSplit', checked)}
                        />
                        <Label>Split across multiple accounts</Label>
                    </div>

                    {!isSplit ? (
                        <div className="p-4 rounded-xl bg-muted/30 border space-y-3 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{accountLabel}</Label>
                                {selectedAccount && (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border animate-in fade-in zoom-in duration-300">
                                        Balance: {selectedAccount.balance.toLocaleString()} {selectedAccount.currencyCode}
                                    </span>
                                )}
                            </div>
                            <Select
                                onValueChange={(val) => {
                                    setValue('distributions.0.currencyBalanceId', val);
                                    setValue('distributions.0.amount', totalAmount);
                                }}
                            >
                                <SelectTrigger className="h-14 bg-background">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            <div className="flex flex-col items-start py-1">
                                                <span className="font-medium text-sm">{acc.label}</span>
                                                <span className="text-xs text-muted-foreground">{acc.currencyCode} • {acc.balance.toLocaleString()}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label>Distributions</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => append({ currencyBalanceId: '', amount: 0 })}
                                >
                                    <Plus className="h-4 w-4 mr-1" /> Add
                                </Button>
                            </div>
                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="flex gap-2 items-end">
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-xs">Account</Label>
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <Select
                                                    onValueChange={(val) => setValue(`distributions.${index}.currencyBalanceId`, val)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableAccounts.map(acc => (
                                                            <SelectItem key={acc.id} value={acc.id}>
                                                                <div className="flex flex-col items-start py-1">
                                                                    <span className="font-medium text-xs">{acc.label}</span>
                                                                    <span className="text-[10px] text-muted-foreground">{acc.currencyCode} • {acc.balance.toLocaleString()}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="w-24 space-y-1">
                                            <Label className="text-xs">Amount</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                {...register(`distributions.${index}.amount`, { valueAsNumber: true })}
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-500 mb-0.5"
                                            onClick={() => remove(index)}
                                            disabled={fields.length === 1}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            {errors.distributions && <p className="text-sm text-red-500">{errors.distributions.message}</p>}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Note (Optional)</Label>
                        <Input {...register('note')} placeholder="e.g. Partial repayment" />
                    </div>

                    <SheetFooter>
                        <Button type="submit" disabled={addPaymentMutation.isLoading}>
                            {addPaymentMutation.isLoading ? "Recording..." : "Record Payment"}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
