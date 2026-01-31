import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
    SheetClose
} from '@/components/ui/sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { CreditCard, Wallet } from 'lucide-react';

const paymentSchema = z.object({
    currencyBalanceId: z.string().min(1, 'Account is required'),
    amount: z.number().positive('Amount must be positive'),
    paidAt: z.string(),
    note: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface Subscription {
    id: string;
    name: string;
    amount: string;
    currency: string;
    icon: string;
    color: string;
}

interface SubscriptionPaymentSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subscription: Subscription | null;
}

export function SubscriptionPaymentSheet({ open, onOpenChange, subscription }: SubscriptionPaymentSheetProps) {
    const utils = trpc.useUtils();
    const { data: accountsData } = trpc.account.list.useQuery({});

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<PaymentFormData>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            paidAt: new Date().toISOString().split('T')[0],
        }
    });

    const selectedCurrencyBalanceId = watch('currencyBalanceId');

    // Get available accounts matching subscription currency
    const availableAccounts = useMemo(() => {
        if (!subscription || !accountsData) return [];

        return (accountsData as any[]).flatMap(acc =>
            (acc.currencyBalances as any[])
                .filter(cb => cb.currencyCode === subscription.currency)
                .map(cb => ({
                    id: cb.id,
                    label: `[${acc.bank?.name || 'Bank'}] ${acc.name} - ${cb.currencyCode}`,
                    balance: Number(cb.balance),
                    currencyCode: cb.currencyCode
                }))
        );
    }, [subscription, accountsData]);

    const selectedAccount = useMemo(() => {
        return availableAccounts.find(acc => acc.id === selectedCurrencyBalanceId);
    }, [availableAccounts, selectedCurrencyBalanceId]);

    useEffect(() => {
        if (subscription && open) {
            setValue('amount', Number(subscription.amount));
            setValue('paidAt', new Date().toISOString().split('T')[0]);
            // Auto-select first available account
            if (availableAccounts.length > 0 && !selectedCurrencyBalanceId) {
                setValue('currencyBalanceId', availableAccounts[0].id);
            }
        }
    }, [subscription, open, setValue, availableAccounts, selectedCurrencyBalanceId]);

    const makePayment = trpc.subscription.makePayment.useMutation({
        onSuccess: (data: any) => {
            utils.subscription.list.invalidate();
            utils.subscription.getUpcoming.invalidate();
            utils.subscription.getCalendarView.invalidate();
            utils.account.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.transaction.list.invalidate();
            toast.success(`Payment successful! New balance: ${data.newBalance.toFixed(2)}`);
            onOpenChange(false);
            reset();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to make payment');
        }
    });

    const onSubmit = (data: PaymentFormData) => {
        if (!subscription) return;

        makePayment.mutate({
            subscriptionId: subscription.id,
            currencyBalanceId: data.currencyBalanceId,
            amount: data.amount,
            paidAt: data.paidAt,
            note: data.note,
        });
    };

    const handleClose = () => {
        onOpenChange(false);
        reset();
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return amount.toLocaleString('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2
        });
    };

    if (!subscription) return null;

    const paymentAmount = watch('amount') || Number(subscription.amount);
    const hasInsufficientFunds = selectedAccount && paymentAmount > selectedAccount.balance;

    return (
        <Sheet open={open} onOpenChange={handleClose}>
            <SheetContent className="sm:max-w-[450px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <span className="text-2xl">{subscription.icon}</span>
                        Pay {subscription.name}
                    </SheetTitle>
                    <SheetDescription>
                        Make a payment from any of your accounts
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-6">
                    {/* Account Selection */}
                    <div className="space-y-2">
                        <Label>Pay From Account</Label>
                        {availableAccounts.length === 0 ? (
                            <div className="p-4 bg-muted rounded-lg text-center">
                                <Wallet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                    No accounts with {subscription.currency} balance available
                                </p>
                            </div>
                        ) : (
                            <Select
                                value={selectedCurrencyBalanceId}
                                onValueChange={(v) => setValue('currencyBalanceId', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            <div className="flex items-center justify-between w-full gap-4">
                                                <span>{acc.label}</span>
                                                <span className="text-muted-foreground">
                                                    {formatCurrency(acc.balance, acc.currencyCode)}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {errors.currencyBalanceId && (
                            <p className="text-sm text-red-500">{errors.currencyBalanceId.message}</p>
                        )}
                    </div>

                    {/* Selected Account Balance */}
                    {selectedAccount && (
                        <div className={`p-3 rounded-lg border ${hasInsufficientFunds ? 'border-red-500 bg-red-500/10' : 'border-border'}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Available Balance</span>
                                <span className={`font-semibold ${hasInsufficientFunds ? 'text-red-500' : ''}`}>
                                    {formatCurrency(selectedAccount.balance, selectedAccount.currencyCode)}
                                </span>
                            </div>
                            {hasInsufficientFunds && (
                                <p className="text-xs text-red-500 mt-1">
                                    Insufficient funds for this payment
                                </p>
                            )}
                        </div>
                    )}

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <div className="relative">
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                className="pl-12"
                                {...register('amount', { valueAsNumber: true })}
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                {subscription.currency}
                            </span>
                        </div>
                        {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                    </div>

                    {/* Date */}
                    <div className="space-y-2">
                        <Label htmlFor="paidAt">Payment Date</Label>
                        <Input
                            id="paidAt"
                            type="date"
                            {...register('paidAt')}
                        />
                    </div>

                    {/* Note */}
                    <div className="space-y-2">
                        <Label htmlFor="note">Note (optional)</Label>
                        <Input
                            id="note"
                            placeholder="Payment reference or notes..."
                            {...register('note')}
                        />
                    </div>

                    {/* Summary */}
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Subscription</span>
                            <span className="font-medium">{subscription.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Payment Amount</span>
                            <span className="font-semibold text-lg">
                                {formatCurrency(paymentAmount, subscription.currency)}
                            </span>
                        </div>
                        {selectedAccount && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Balance After</span>
                                <span className={hasInsufficientFunds ? 'text-red-500' : 'text-green-500'}>
                                    {formatCurrency(selectedAccount.balance - paymentAmount, selectedAccount.currencyCode)}
                                </span>
                            </div>
                        )}
                    </div>

                    <SheetFooter className="pt-2">
                        <SheetClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </SheetClose>
                        <Button
                            type="submit"
                            disabled={
                                makePayment.isPending ||
                                availableAccounts.length === 0 ||
                                hasInsufficientFunds
                            }
                        >
                            <CreditCard className="h-4 w-4 mr-2" />
                            {makePayment.isPending ? 'Processing...' : 'Confirm Payment'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
