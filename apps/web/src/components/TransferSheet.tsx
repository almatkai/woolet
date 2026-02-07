import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
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
    SheetTrigger,
} from '@/components/ui/sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
// Switch removed (unused)
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const transferSchema = z.object({
    fromCurrencyBalanceId: z.string().min(1, "Sender account required"),
    toCurrencyBalanceId: z.string().min(1, "Receiver account required"),
    amount: z.number().positive("Amount must be positive"),
    date: z.string().min(1, "Date required"),
    description: z.string().default(''),
    // Fee logic
    feeType: z.enum(['none', 'flat', 'percentage']).default('none'),
    feeValue: z.number().min(0).default(0),
    feeAmount: z.number().min(0).default(0), // Calculated actual fee
    exchangeRate: z.number().positive().default(1),
});

type TransferForm = any;

interface TransferSheetProps {
    preselectedSenderId?: string;
    trigger?: React.ReactNode;
}

export function TransferSheet({ preselectedSenderId, trigger }: TransferSheetProps) {
    const [open, setOpen] = useState(false);
    const utils = trpc.useUtils();

    // Fetch all accounts to populate sender/receiver lists
    const { data: accountsData } = trpc.account.list.useQuery({});

    const allBalances = useMemo(() => {
        if (!accountsData) return [];
        return accountsData.flatMap((acc: any) =>
            acc.currencyBalances.map((cb: any) => ({
                id: cb.id,
                currencyCode: cb.currencyCode,
                accountName: acc.name,
                bankName: acc.bank?.name,
                last4Digits: acc.last4Digits,
                balance: Number(cb.balance)
            }))
        );
    }, [accountsData]);

    const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<TransferForm>({
        resolver: zodResolver(transferSchema),
        defaultValues: {
            fromCurrencyBalanceId: preselectedSenderId || '',
            toCurrencyBalanceId: '',
            amount: 0,
            date: new Date().toISOString().split('T')[0],
            feeType: 'none',
            feeValue: 0,
            feeAmount: 0,
            exchangeRate: 1,
            description: '',
        }
    });

    const createTransaction = trpc.transaction.create.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            utils.transaction.list.invalidate();
            toast.success('Transfer successful');
            setOpen(false);
            reset();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const amount = watch('amount');
    const feeType = watch('feeType');
    const feeValue = watch('feeValue') || 0;
    const fromId = watch('fromCurrencyBalanceId');
    const toId = watch('toCurrencyBalanceId');
    const exchangeRate = watch('exchangeRate') || 1;

    // Calculate fee dynamically
    const calculatedFee = useMemo(() => {
        if (feeType === 'none') return 0;
        if (feeType === 'flat') return feeValue;
        if (feeType === 'percentage') return (amount * feeValue) / 100;
        return 0;
    }, [amount, feeType, feeValue]);

    // Derived sender/receiver for UI feedback
    const sender = allBalances.find((b: any) => b.id === fromId);
    const receiver = allBalances.find((b: any) => b.id === toId);

    const onSubmit = (data: TransferForm) => {
        if (data.fromCurrencyBalanceId === data.toCurrencyBalanceId) {
            toast.error("Sender and receiver accounts must be different");
            return;
        }

        createTransaction.mutate({
            type: 'transfer',
            currencyBalanceId: data.fromCurrencyBalanceId, // Source
            toCurrencyBalanceId: data.toCurrencyBalanceId, // Target
            amount: data.amount,
            fee: calculatedFee,
            exchangeRate: data.exchangeRate,
            date: data.date,
            description: data.description || `Transfer to ${receiver?.accountName}`,
        });
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                {trigger || (
                    <Button className="gap-2">
                        <ArrowLeftRight className="h-4 w-4" />
                        Transfer
                    </Button>
                )}
            </SheetTrigger>
            <SheetContent className="sm:max-w-[500px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Transfer Money</SheetTitle>
                    <SheetDescription>
                        Move money between your accounts with optional fees and exchange rates.
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-6">
                    {/* Sender Selection */}
                    <div className="p-4 rounded-xl bg-muted/30 border space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From (Sender)</Label>
                            {sender && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border animate-in fade-in zoom-in duration-300">
                                    Balance: {sender.balance.toLocaleString()} {sender.currencyCode}
                                </span>
                            )}
                        </div>
                        <Select
                            onValueChange={(val) => setValue('fromCurrencyBalanceId', val)}
                            defaultValue={preselectedSenderId}
                        >
                            <SelectTrigger className="h-14 bg-background">
                                <SelectValue placeholder="Select sender account" />
                            </SelectTrigger>
                            <SelectContent>
                                {allBalances.map((b: any) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        <div className="flex flex-col items-start py-1">
                                            <span className="font-medium text-sm">{b.bankName ? `[${b.bankName}${b.last4Digits ? ` ${b.last4Digits}` : ''}] ` : ''}{b.accountName}</span>
                                            <span className="text-xs text-muted-foreground">{b.currencyCode} • {b.balance.toLocaleString()}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.fromCurrencyBalanceId && <p className="text-sm text-red-500">{(errors.fromCurrencyBalanceId as any).message}</p>}
                    </div>

                    <div className="flex justify-center -my-2 relative z-10">
                        <div className="bg-background rounded-full p-1 border shadow-sm">
                            <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                        </div>
                    </div>

                    {/* Receiver Selection */}
                    <div className="p-4 rounded-xl bg-muted/30 border space-y-3">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To (Receiver)</Label>
                        <Select onValueChange={(val) => setValue('toCurrencyBalanceId', val)}>
                            <SelectTrigger className="h-14 bg-background">
                                <SelectValue placeholder="Select receiver account" />
                            </SelectTrigger>
                            <SelectContent>
                                {allBalances
                                    .filter((b: any) => b.id !== fromId) // Exclude sender
                                    .map((b: any) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            <div className="flex flex-col items-start py-1">
                                                <span className="font-medium text-sm">{b.bankName ? `[${b.bankName}${b.last4Digits ? ` ${b.last4Digits}` : ''}] ` : ''}{b.accountName}</span>
                                                <span className="text-xs text-muted-foreground">{b.currencyCode} • {b.balance.toLocaleString()}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        {errors.toCurrencyBalanceId && <p className="text-sm text-red-500">{(errors.toCurrencyBalanceId as any).message}</p>}
                    </div>

                    {/* Amount & Date */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Amount</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">
                                    {sender?.currencyCode}
                                </span>
                                <Input
                                    type="number"
                                    step="0.01"
                                    className="pl-12"
                                    {...register('amount', { valueAsNumber: true })}
                                />
                            </div>
                            {errors.amount && <p className="text-sm text-red-500">{(errors.amount as any).message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Input type="date" {...register('date')} />
                        </div>
                    </div>

                    {/* Exchange Rate (only if currencies differ) */}
                    {sender && receiver && sender.currencyCode !== receiver.currencyCode && (
                        <div className="p-4 bg-muted/20 rounded-lg space-y-3 border">
                            <Label className="text-xs font-semibold uppercase text-muted-foreground">Currency Exchange</Label>
                            <div className="flex items-center gap-2 text-sm">
                                <span>1 {sender.currencyCode} = </span>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    className="w-24 h-8"
                                    {...register('exchangeRate', { valueAsNumber: true })}
                                />
                                <span>{receiver.currencyCode}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Receiver gets: {(amount * exchangeRate).toLocaleString()} {receiver.currencyCode}
                            </p>
                        </div>
                    )}

                    {/* Fee Section */}
                    <div className="space-y-3 border pt-4 border-t-2 border-dotted">
                        <Label>Transfer Fee</Label>
                        <Tabs
                            value={feeType}
                            onValueChange={(v) => {
                                setValue('feeType', v as any);
                                setValue('feeValue', 0); // Reset value when type changes
                            }}
                            className="w-full"
                        >
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="none">No Fee</TabsTrigger>
                                <TabsTrigger value="flat">Flat</TabsTrigger>
                                <TabsTrigger value="percentage">% Percent</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {feeType !== 'none' && (
                            <div className="space-y-2 mt-2">
                                <Label className="text-xs">
                                    {feeType === 'flat' ? `Fee Amount (${sender?.currencyCode || ''})` : 'Fee Percentage (%)'}
                                </Label>
                                <Input
                                    type="number"
                                    step={feeType === 'flat' ? "0.01" : "0.1"}
                                    placeholder="0"
                                    {...register('feeValue', { valueAsNumber: true })}
                                />
                                <p className="text-sm font-medium text-destructive">
                                    Total Deduction: {(amount + calculatedFee).toLocaleString()} {sender?.currencyCode}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">
                                        (Amount: {amount} + Fee: {calculatedFee})
                                    </span>
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Note (Optional)</Label>
                        <Input {...register('description')} placeholder="e.g. Rent share, Monthly saving" />
                    </div>

                    <Button type="submit" className="w-full" disabled={createTransaction.isLoading}>
                        {createTransaction.isLoading ? "Processing..." : "Confirm Transfer"}
                    </Button>
                </form>
            </SheetContent>
        </Sheet>
    );
}
