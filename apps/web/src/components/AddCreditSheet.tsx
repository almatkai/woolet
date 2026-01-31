import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { CurrencySelect } from './CurrencySelect';

const creditSchema = z.object({
    accountId: z.string().uuid(),
    name: z.string().min(1, 'Name is required'),
    principalAmount: z.string().min(1),
    interestRate: z.string().min(1),
    monthlyPayment: z.string().min(1),
    remainingBalance: z.string().min(1),
    currency: z.string().length(3),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    status: z.enum(['active', 'paid_off', 'defaulted']),
});

type CreditFormValues = z.infer<typeof creditSchema>;

interface AddCreditSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingCredit?: {
        id: string;
        name: string;
        principalAmount: string;
        interestRate: string;
        monthlyPayment: string;
        remainingBalance: string;
        currency: string;
        startDate: string;
        endDate: string;
        status: string;
    } | null;
}

export function AddCreditSheet({ open, onOpenChange, editingCredit }: AddCreditSheetProps) {
    const [markPastMonthsAsPaid, setMarkPastMonthsAsPaid] = useState(true);
    const utils = trpc.useUtils();
    const { data: banks } = trpc.bank.getHierarchy.useQuery();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreditFormValues>({
        resolver: zodResolver(creditSchema),
        defaultValues: {
            status: 'active',
            currency: 'KZT',
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        }
    });

    const createCredit = trpc.credit.create.useMutation({
        onSuccess: () => {
            utils.credit.list.invalidate();
            toast.success('Credit added successfully');
            reset();
            onOpenChange(false);
        },
        onError: (error: any) => toast.error(error.message || 'Failed to add credit'),
    });

    const updateCredit = trpc.credit.update.useMutation({
        onSuccess: () => {
            utils.credit.list.invalidate();
            toast.success('Credit updated successfully');
            reset();
            onOpenChange(false);
        },
        onError: (error: any) => toast.error(error.message || 'Failed to update credit'),
    });

    useEffect(() => {
        if (editingCredit) {
            setValue('name', editingCredit.name);
            setValue('principalAmount', editingCredit.principalAmount);
            setValue('interestRate', editingCredit.interestRate);
            setValue('monthlyPayment', editingCredit.monthlyPayment);
            setValue('remainingBalance', editingCredit.remainingBalance);
            setValue('currency', editingCredit.currency);
            setValue('startDate', editingCredit.startDate);
            setValue('endDate', editingCredit.endDate);
            setValue('status', editingCredit.status as 'active' | 'paid_off' | 'defaulted');
        } else {
            reset();
        }
    }, [editingCredit, setValue, reset]);

    const onSubmit = (data: CreditFormValues) => {
        if (editingCredit) {
            updateCredit.mutate({
                id: editingCredit.id,
                name: data.name,
                monthlyPayment: Number(data.monthlyPayment),
                remainingBalance: Number(data.remainingBalance),
                status: data.status,
            });
        } else {
            createCredit.mutate({
                ...data,
                principalAmount: Number(data.principalAmount),
                interestRate: Number(data.interestRate),
                monthlyPayment: Number(data.monthlyPayment),
                remainingBalance: Number(data.remainingBalance),
                markPastMonthsAsPaid,
            });
        }
    };

    // Flatten currency balances for dropdown
    const accountOptions = useMemo(() => {
        if (!banks) return [];
        return banks.flatMap((bank: any) =>
            bank.accounts.flatMap((acc: any) =>
                acc.currencyBalances.map((cb: any) => ({
                    id: cb.id,
                    accountId: acc.id,
                    label: `[${bank.name}] ${acc.name}`,
                    balance: Number(cb.balance),
                    currencyCode: cb.currencyCode
                }))
            )
        );
    }, [banks]);

    const accountId = watch('accountId');
    const selectedAccount = useMemo(() =>
        accountOptions.find((o: any) => o.accountId === accountId),
        [accountOptions, accountId]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-[500px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{editingCredit ? 'Edit Credit' : 'Add Credit'}</SheetTitle>
                    <SheetDescription>
                        {editingCredit ? 'Update credit details' : 'Add a new loan or credit line'}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                    <div className="space-y-2">
                        <Label>Name *</Label>
                        <Input {...register('name')} placeholder="e.g., Car Loan" />
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                    </div>

                    {!editingCredit && (
                        <div className="p-4 rounded-xl bg-muted/30 border space-y-3 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Account</Label>
                                {selectedAccount && (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border animate-in fade-in zoom-in duration-300">
                                        Balance: {selectedAccount.balance.toLocaleString()} {selectedAccount.currencyCode}
                                    </span>
                                )}
                            </div>
                            <Select
                                onValueChange={(v) => {
                                    const opt = accountOptions.find((o: any) => o.id === v);
                                    if (opt) {
                                        setValue('accountId', opt.accountId);
                                        setValue('currency', opt.currencyCode);
                                    }
                                }}
                            >
                                <SelectTrigger className="h-14 bg-background">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accountOptions.map((opt: any) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            <div className="flex flex-col items-start py-1">
                                                <span className="font-medium text-sm">{opt.label}</span>
                                                <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Principal Amount *</Label>
                            <Input
                                type="number"
                                step="0.01"
                                {...register('principalAmount')}
                                placeholder="100000"
                                disabled={!!editingCredit}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Interest Rate (%) *</Label>
                            <Input
                                type="number"
                                step="0.01"
                                {...register('interestRate')}
                                placeholder="12.5"
                                disabled={!!editingCredit}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Monthly Payment *</Label>
                            <Input type="number" step="0.01" {...register('monthlyPayment')} placeholder="5000" />
                        </div>
                        <div className="space-y-2">
                            <Label>Remaining Balance *</Label>
                            <Input type="number" step="0.01" {...register('remainingBalance')} placeholder="80000" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Currency *</Label>
                            <CurrencySelect
                                value={watch('currency')}
                                onValueChange={(v) => setValue('currency', v)}
                                disabled={!!editingCredit}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Status *</Label>
                            <Select
                                onValueChange={(v) => setValue('status', v as 'active' | 'paid_off' | 'defaulted')}
                                defaultValue={watch('status')}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="paid_off">Paid Off</SelectItem>
                                    <SelectItem value="defaulted">Defaulted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date *</Label>
                            <Input type="date" {...register('startDate')} disabled={!!editingCredit} />
                        </div>
                        <div className="space-y-2">
                            <Label>End Date *</Label>
                            <Input type="date" {...register('endDate')} disabled={!!editingCredit} />
                        </div>
                    </div>

                    {!editingCredit && (
                        <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/50">
                            <Checkbox
                                id="markPastMonthsAsPaid"
                                checked={markPastMonthsAsPaid}
                                onCheckedChange={(checked) => setMarkPastMonthsAsPaid(!!checked)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="markPastMonthsAsPaid" className="font-medium cursor-pointer">
                                    Mark past months as paid
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Auto-mark months from next month of start date to today as already paid (no money deducted)
                                </p>
                            </div>
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={createCredit.isLoading || updateCredit.isLoading}>
                        {createCredit.isLoading || updateCredit.isLoading ? 'Saving...' : editingCredit ? 'Update Credit' : 'Add Credit'}
                    </Button>
                </form>
            </SheetContent>
        </Sheet>
    );
}
