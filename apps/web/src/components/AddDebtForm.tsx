import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { CurrencySelect } from './CurrencySelect';
import { Switch } from '@/components/ui/switch';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const createDebtSchema = z.object({
    isExternal: z.boolean(),
    currencyBalanceId: z.string().uuid().optional().nullable(),
    currencyCode: z.string().optional().nullable(),
    personName: z.string().min(1, "Person name is required").max(100),
    personContact: z.string().optional(),
    amount: z.coerce.number().positive("Amount must be positive"),
    type: z.enum(['i_owe', 'they_owe']),
    description: z.string().optional(),
    dueDate: z.string().optional(),
}).superRefine((data, ctx) => {
    if (!data.isExternal && !data.currencyBalanceId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required",
            path: ["currencyBalanceId"]
        });
    }
    if (data.isExternal && !data.currencyCode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required",
            path: ["currencyCode"]
        });
    }
});

type CreateDebtForm = z.infer<typeof createDebtSchema>;

interface AddDebtFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export function AddDebtForm({ onSuccess, onCancel }: AddDebtFormProps) {
    const utils = trpc.useUtils();
    const { data: banks } = trpc.bank.getHierarchy.useQuery();

    const currencyOptions = useMemo(() => {
        if (!banks) return [];
        const options: { id: string, label: string, balance: number, currencyCode: string }[] = [];
        banks.forEach((bank: any) => {
            bank.accounts.forEach((acc: any) => {
                acc.currencyBalances.forEach((cb: any) => {
                    options.push({
                        id: cb.id,
                        label: `[${bank.name}${acc.last4Digits ? ` ${acc.last4Digits}` : ''}] ${acc.name} - ${cb.currencyCode}`,
                        balance: Number(cb.balance),
                        currencyCode: cb.currencyCode
                    });
                });
            });
        });
        return options;
    }, [banks]);

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateDebtForm>({
        resolver: zodResolver(createDebtSchema),
        defaultValues: {
            isExternal: false,
            personName: '',
            amount: 0,
            type: 'i_owe',
        }
    });

    const isExternal = watch('isExternal');
    const currencyBalanceId = watch('currencyBalanceId');
    const selectedAccount = useMemo(() =>
        currencyOptions.find(o => o.id === currencyBalanceId),
        [currencyOptions, currencyBalanceId]);

    const createDebt = trpc.debt.create.useMutation({
        onSuccess: () => {
            utils.debt.list.invalidate();
            reset();
            onSuccess();
            toast.success('Debt added successfully');
        },
        onError: (error: unknown) => {
            console.error("Failed to create debt:", error);
            toast.error('Failed to create debt');
        }
    });

    const onSubmit = (data: CreateDebtForm) => {
        if (data.type === 'they_owe') {
            const selectedAccount = currencyOptions.find(opt => opt.id === data.currencyBalanceId);
            if (selectedAccount && data.amount > selectedAccount.balance) {
                toast.error(`Insufficient funds. You only have ${selectedAccount.balance} ${selectedAccount.currencyCode} in this account.`);
                return;
            }
        }
        createDebt.mutate(data);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="currencyBalanceId">
                            {isExternal ? "Currency *" : "Account (Currency) *"}
                        </Label>
                        <div className="flex items-center gap-2 bg-muted/30 px-2 py-1 rounded-md border border-transparent hover:border-muted-foreground/20 transition-all">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap">
                                    Not Tracked
                                </span>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-[200px]" side="right">
                                            <p>Enable if this debt was created before you started tracking accounts. No transactions will be created and bank balances won't be affected.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Switch
                                id="isExternal"
                                checked={isExternal}
                                onCheckedChange={(checked) => {
                                    setValue('isExternal', checked);
                                    if (checked) {
                                        setValue('currencyBalanceId', null);
                                    } else {
                                        setValue('currencyCode', null);
                                    }
                                }}
                                className="scale-75"
                            />
                        </div>
                    </div>

                    {!isExternal ? (
                        <div className="p-4 rounded-xl bg-muted/30 border space-y-3 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</Label>
                                {selectedAccount && (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border animate-in fade-in zoom-in duration-300">
                                        Balance: {selectedAccount.balance.toLocaleString()} {selectedAccount.currencyCode}
                                    </span>
                                )}
                            </div>
                            <Select
                                onValueChange={(val) => {
                                    setValue('currencyBalanceId', val);
                                    const opt = currencyOptions.find(o => o.id === val);
                                    if (opt) setValue('currencyCode', opt.currencyCode);
                                }}
                                defaultValue={watch('currencyBalanceId') || ''}
                            >
                                <SelectTrigger className="h-14 bg-background">
                                    <SelectValue placeholder="Select Account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencyOptions.map(opt => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            <div className="flex flex-col items-start py-1">
                                                <span className="font-medium text-sm">{opt.label}</span>
                                                <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.currencyBalanceId && <p className="text-sm text-red-500 mt-1">{errors.currencyBalanceId.message}</p>}
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                            <CurrencySelect
                                value={watch('currencyCode') || ''}
                                onValueChange={(val) => setValue('currencyCode', val)}
                            />
                            {errors.currencyCode && <p className="text-sm text-red-500 mt-1">{errors.currencyCode.message}</p>}
                            <p className="text-[11px] text-muted-foreground italic mt-1.5 px-1">
                                Historical debt. No account will be affected.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="personName">Person/Entity Name</Label>
                <Input id="personName" placeholder="e.g. John Doe or Bank" {...register('personName')} />
                {errors.personName && <p className="text-sm text-red-500">{errors.personName.message}</p>}
            </div>

            <div className="space-y-2">
                <Label>Type</Label>
                <div className="grid grid-cols-2 gap-4">
                    <Button
                        type="button"
                        variant={watch('type') === 'i_owe' ? 'default' : 'outline'}
                        onClick={() => setValue('type', 'i_owe')}
                        className={cn(
                            watch('type') === 'i_owe' && "bg-red-600 hover:bg-red-700"
                        )}
                    >
                        I Owe (Payable)
                    </Button>
                    <Button
                        type="button"
                        variant={watch('type') === 'they_owe' ? 'default' : 'outline'}
                        onClick={() => setValue('type', 'they_owe')}
                        className={cn(
                            watch('type') === 'they_owe' && "bg-green-600 hover:bg-green-700"
                        )}
                    >
                        They Owe (Receivable)
                    </Button>
                </div>
                {errors.type && <p className="text-sm text-red-500">{errors.type.message}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" type="number" step="0.01" {...register('amount')} />
                {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date (Optional)</Label>
                <Input id="dueDate" type="date" {...register('dueDate')} />
                {errors.dueDate && <p className="text-sm text-red-500">{errors.dueDate.message}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input id="description" placeholder="Notes..." {...register('description')} />
            </div>

            <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                    Cancel
                </Button>
                <Button type="submit" disabled={createDebt.isLoading} className="flex-1 gap-2">
                    {!createDebt.isLoading && <Plus className="h-4 w-4" />}
                    {createDebt.isLoading ? 'Adding...' : 'Add Debt'}
                </Button>
            </div>
        </form>
    );
}
