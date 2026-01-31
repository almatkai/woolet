import { useEffect, useMemo, useState } from 'react';
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

const depositSchema = z.object({
    accountId: z.string().uuid(),
    currencyBalanceId: z.string().uuid(),
    depositName: z.string().min(1, 'Deposit name is required'),
    principalAmount: z.string().min(1),
    currentBalance: z.string().min(1),
    interestRate: z.string().min(1),
    compoundingFrequency: z.enum(['daily', 'monthly', 'quarterly', 'annually']),
    currency: z.string().length(3),
    startDate: z.string().min(1),
    maturityDate: z.string().optional(),
    isFlexible: z.boolean(),
    skipWithdrawal: z.boolean(),
    status: z.enum(['active', 'matured', 'withdrawn']),
});

type DepositFormValues = z.infer<typeof depositSchema>;

interface AddDepositSheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    editingDeposit?: {
        id: string;
        bankName: string;
        depositName: string;
        principalAmount: string;
        currentBalance: string;
        interestRate: string;
        compoundingFrequency: string;
        currency: string;
        startDate: string;
        maturityDate: string | null;
        isFlexible: boolean;
        status: string;
    } | null;
}

export function AddDepositSheet({ open: controlledOpen, onOpenChange: controlledOnOpenChange, editingDeposit }: AddDepositSheetProps = {}) {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = controlledOnOpenChange || setInternalOpen;

    const utils = trpc.useUtils();
    const { data: banks } = trpc.bank.getHierarchy.useQuery();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<DepositFormValues>({
        resolver: zodResolver(depositSchema),
        defaultValues: {
            status: 'active',
            currency: 'KZT',
            compoundingFrequency: 'monthly',
            isFlexible: true,
            startDate: new Date().toISOString().split('T')[0],
        }
    });

    const createDeposit = trpc.deposit.create.useMutation({
        onSuccess: () => {
            utils.deposit.list.invalidate();
            toast.success('Deposit added successfully');
            reset();
            setOpen(false);
        },
        onError: (error: any) => toast.error(error.message || 'Failed to add deposit'),
    });

    const updateDeposit = trpc.deposit.update.useMutation({
        onSuccess: () => {
            utils.deposit.list.invalidate();
            toast.success('Deposit updated successfully');
            reset();
            setOpen(false);
        },
        onError: (error: any) => toast.error(error.message || 'Failed to update deposit'),
    });

    useEffect(() => {
        if (editingDeposit) {
            setValue('depositName', editingDeposit.depositName);
            setValue('principalAmount', editingDeposit.principalAmount);
            setValue('currentBalance', editingDeposit.currentBalance);
            setValue('interestRate', editingDeposit.interestRate);
            setValue('compoundingFrequency', editingDeposit.compoundingFrequency as 'daily' | 'monthly' | 'quarterly' | 'annually');
            setValue('currency', editingDeposit.currency);
            setValue('startDate', editingDeposit.startDate);
            setValue('maturityDate', editingDeposit.maturityDate || '');
            setValue('isFlexible', editingDeposit.isFlexible);
            setValue('status', editingDeposit.status as 'active' | 'matured' | 'withdrawn');
        } else {
            reset();
        }
    }, [editingDeposit, setValue, reset]);

    const onSubmit = (data: DepositFormValues) => {
        if (editingDeposit) {
            updateDeposit.mutate({
                id: editingDeposit.id,
                depositName: data.depositName,
                currentBalance: Number(data.currentBalance),
                interestRate: Number(data.interestRate),
                maturityDate: data.maturityDate || undefined,
                status: data.status,
            });
        } else {
            createDeposit.mutate({
                ...data,
                principalAmount: Number(data.principalAmount),
                currentBalance: Number(data.currentBalance),
                interestRate: Number(data.interestRate),
                maturityDate: data.maturityDate || undefined,
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
                    bankName: bank.name,
                    label: `[${bank.name}] ${acc.name}`,
                    balance: Number(cb.balance),
                    currencyCode: cb.currencyCode
                }))
            )
        );
    }, [banks]);

    const currencyBalanceId = watch('currencyBalanceId');
    const selectedAccount = useMemo(() =>
        accountOptions.find((o: any) => o.id === currencyBalanceId),
        [accountOptions, currencyBalanceId]);

    const isFlexible = watch('isFlexible');
    const skipWithdrawal = watch('skipWithdrawal');
    const [manualOverride, setManualOverride] = useState(false);

    const principalAmount = watch('principalAmount');
    const interestRate = watch('interestRate');
    const compoundingFrequency = watch('compoundingFrequency');
    const startDate = watch('startDate');

    // Auto-calculate current balance based on compound interest
    useEffect(() => {
        if (editingDeposit || manualOverride || !principalAmount || !interestRate || !startDate) return;

        const principal = Number(principalAmount);
        const rate = Number(interestRate) / 100;
        const start = new Date(startDate);
        const now = new Date();

        // Calculate time elapsed
        const yearsElapsed = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

        // Compound interest formula: A = P(1 + r/n)^(nt)
        let n = 12; // monthly by default
        if (compoundingFrequency === 'daily') n = 365;
        else if (compoundingFrequency === 'quarterly') n = 4;
        else if (compoundingFrequency === 'annually') n = 1;

        const calculatedBalance = principal * Math.pow(1 + rate / n, n * yearsElapsed);
        setValue('currentBalance', calculatedBalance.toFixed(2));
    }, [principalAmount, interestRate, compoundingFrequency, startDate, editingDeposit, manualOverride, setValue]);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent className="sm:max-w-[500px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{editingDeposit ? 'Edit Deposit' : 'Add Deposit'}</SheetTitle>
                    <SheetDescription>
                        {editingDeposit ? 'Update deposit details' : 'Add a new savings deposit'}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                    <div className="space-y-2">
                        <Label>Deposit Name *</Label>
                        <Input {...register('depositName')} placeholder="e.g., Savings Plus" />
                        {errors.depositName && <p className="text-xs text-destructive">{errors.depositName.message}</p>}
                    </div>

                    {!editingDeposit && (
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
                                        setValue('currencyBalanceId', opt.id);
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
                                placeholder="1000000"
                                disabled={!!editingDeposit}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Current Balance *</Label>
                                {!editingDeposit && (
                                    <button
                                        type="button"
                                        onClick={() => setManualOverride(!manualOverride)}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        {manualOverride ? 'Auto-calculate' : 'Manual override'}
                                    </button>
                                )}
                            </div>
                            <Input
                                type="number"
                                step="0.01"
                                {...register('currentBalance')}
                                placeholder="1050000"
                                disabled={!editingDeposit && !manualOverride}
                                className={!editingDeposit && !manualOverride ? 'bg-muted/50' : ''}
                            />
                            {!editingDeposit && !manualOverride && (
                                <p className="text-xs text-muted-foreground">Auto-calculated based on interest rate</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Interest Rate (%) *</Label>
                            <Input type="number" step="0.01" {...register('interestRate')} placeholder="14.5" />
                        </div>
                        <div className="space-y-2">
                            <Label>Compounding *</Label>
                            <Select
                                onValueChange={(v) => setValue('compoundingFrequency', v as 'daily' | 'monthly' | 'quarterly' | 'annually')}
                                defaultValue={watch('compoundingFrequency')}
                                disabled={!!editingDeposit}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">Daily</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                    <SelectItem value="annually">Annually</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Currency *</Label>
                            <CurrencySelect
                                value={watch('currency')}
                                onValueChange={(v) => setValue('currency', v)}
                                disabled={!!editingDeposit}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Status *</Label>
                            <Select
                                onValueChange={(v) => setValue('status', v as 'active' | 'matured' | 'withdrawn')}
                                defaultValue={watch('status')}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="matured">Matured</SelectItem>
                                    <SelectItem value="withdrawn">Withdrawn</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date *</Label>
                            <Input type="date" {...register('startDate')} disabled={!!editingDeposit} />
                        </div>
                        <div className="space-y-2">
                            <Label>Maturity Date</Label>
                            <Input type="date" {...register('maturityDate')} />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="isFlexible"
                                checked={isFlexible}
                                onCheckedChange={(checked) => setValue('isFlexible', !!checked)}
                                disabled={!!editingDeposit}
                            />
                            <Label htmlFor="isFlexible" className="text-sm font-normal">
                                Flexible deposit (can withdraw anytime)
                            </Label>
                        </div>

                        {!editingDeposit && (
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skipWithdrawal"
                                    checked={skipWithdrawal}
                                    onCheckedChange={(checked) => setValue('skipWithdrawal', !!checked)}
                                />
                                <Label htmlFor="skipWithdrawal" className="text-sm font-normal">
                                    Skip withdrawal from account (for existing deposits added before using this app)
                                </Label>
                            </div>
                        )}
                    </div>

                    <Button type="submit" className="w-full" disabled={createDeposit.isLoading || updateDeposit.isLoading}>
                        {createDeposit.isLoading || updateDeposit.isLoading ? 'Saving...' : editingDeposit ? 'Update Deposit' : 'Add Deposit'}
                    </Button>
                </form>
            </SheetContent>
        </Sheet>
    );
}
