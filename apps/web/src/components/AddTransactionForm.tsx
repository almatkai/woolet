import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { ManageCategoriesSheet } from '@/components/ManageCategoriesSheet';
import { SplitSelector, ManageParticipantsSheet } from '@/components/SplitBillComponents';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, Calendar, FileText } from 'lucide-react';

interface Category {
    id: string;
    name: string;
    icon: string;
    color: string;
    type?: 'income' | 'expense' | 'transfer';
}

const createTransactionFormSchema = z.object({
    currencyBalanceId: z.string().min(1, "Account/Currency is required"),
    categoryId: z.string().min(1, "Category is required"),
    amount: z.string().min(1, "Amount is required"),
    type: z.enum(['income', 'expense', 'transfer']),
    description: z.string().optional(),
    date: z.string().min(1, "Date is required"),
    toCurrencyBalanceId: z.string().optional(),
    fee: z.string().optional(),
    cashbackValue: z.string().optional(),
    cashbackMode: z.enum(['amount', 'percent']),
    cashbackMax: z.string().optional(),
    currencyCode: z.string().optional(),
});

type CreateTransactionFormValues = z.infer<typeof createTransactionFormSchema>;

interface AddTransactionFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export function AddTransactionForm({ onSuccess, onCancel }: AddTransactionFormProps) {
    const utils = trpc.useUtils();
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [splitEnabled, setSplitEnabled] = useState(false);
    const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
    const [equalSplit, setEqualSplit] = useState(true);
    const [customAmounts, setCustomAmounts] = useState<{ participantId: string; amount: number }[]>([]);
    const [includeSelf, setIncludeSelf] = useState(false);

    const { data: banks } = trpc.bank.getHierarchy.useQuery();
    const { data: categories } = trpc.category.list.useQuery();

    const currencyOptions = useMemo(() => {
        if (!banks) return [];
        const options: { id: string, label: string, balance: number, currencyCode: string }[] = [];
        banks.forEach((bank: any) => {
            bank.accounts.forEach((acc: any) => {
                acc.currencyBalances.forEach((cb: any) => {
                    options.push({
                        id: cb.id,
                        label: `[${bank.name}] ${acc.name}`,
                        balance: Number(cb.balance),
                        currencyCode: cb.currencyCode
                    });
                });
            });
        });
        return options;
    }, [banks]);

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CreateTransactionFormValues>({
        resolver: zodResolver(createTransactionFormSchema),
        defaultValues: {
            type: 'expense',
            amount: '',
            fee: '',
            cashbackValue: '',
            cashbackMode: 'amount',
            cashbackMax: '',
            date: new Date().toISOString().split('T')[0],
            currencyBalanceId: '',
            categoryId: '',
        }
    });

    const transactionType = watch('type');
    const currencyBalanceId = watch('currencyBalanceId');
    const toCurrencyBalanceId = watch('toCurrencyBalanceId');

    const selectedAccount = useMemo(() =>
        currencyOptions.find(o => o.id === currencyBalanceId),
        [currencyOptions, currencyBalanceId]);

    const selectedToAccount = useMemo(() =>
        currencyOptions.find(o => o.id === toCurrencyBalanceId),
        [currencyOptions, toCurrencyBalanceId]);

    const categoryId = watch('categoryId');
    const selectedCategory = useMemo(() =>
        categories?.find((c: any) => c.id === categoryId),
        [categories, categoryId]);

    const filteredCategories = useMemo(() => {
        if (!categories) return [];
        return categories.filter((cat: any) => {
            if (transactionType === 'transfer') return true;
            return cat.type === transactionType;
        });
    }, [categories, transactionType]);

    useEffect(() => {
        if (!categoryId) return;
        const isValid = filteredCategories.some((cat: any) => cat.id === categoryId);
        if (!isValid) {
            setValue('categoryId', '');
        }
    }, [categoryId, filteredCategories, setValue]);

    const createTransaction = trpc.transaction.create.useMutation({
        onSuccess: () => {
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            reset();
            onSuccess();
            toast.success('Transaction added successfully');
        },
        onError: (error: unknown) => {
            console.error("Failed to create transaction:", error);
            toast.error('Failed to create transaction');
        }
    });

    const onSubmit = (data: CreateTransactionFormValues) => {
        let finalCashback = 0;

        if (data.type === 'expense') {
            const val = Number(data.cashbackValue) || 0;
            if (data.cashbackMode === 'percent') {
                const calculated = (Number(data.amount) * val) / 100;
                const max = Number(data.cashbackMax) || Infinity;
                finalCashback = Math.min(calculated, max);
            } else {
                finalCashback = val;
            }
        }

        const payload = {
            currencyBalanceId: data.currencyBalanceId,
            categoryId: data.categoryId,
            amount: Number(data.amount),
            type: data.type,
            description: data.description,
            date: data.date,
            toCurrencyBalanceId: data.type === 'transfer' && data.toCurrencyBalanceId ? data.toCurrencyBalanceId : undefined,
            fee: data.type === 'transfer' && data.fee ? Number(data.fee) : 0,
            cashbackAmount: finalCashback,
            // Add split data if enabled
            ...(splitEnabled && data.type === 'expense' && selectedParticipants.length > 0 && {
                split: {
                    participants: selectedParticipants,
                    equalSplit,
                    customAmounts: !equalSplit ? customAmounts : [],
                }
            })
        };
        createTransaction.mutate(payload);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue={watch('type') || 'expense'} onValueChange={(val: any) => setValue('type', val)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="expense">Expense</TabsTrigger>
                    <TabsTrigger value="income">Income</TabsTrigger>
                    <TabsTrigger value="transfer">Transfer</TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="p-4 rounded-xl bg-muted/30 border space-y-3 transition-all duration-200">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {transactionType === 'transfer' ? 'From Account' : 'Account'}
                    </Label>
                    {selectedAccount && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border animate-in fade-in zoom-in duration-300">
                            Balance: {selectedAccount.balance.toLocaleString()} {selectedAccount.currencyCode}
                        </span>
                    )}
                </div>
                <Select onValueChange={(val) => setValue('currencyBalanceId', val)} value={watch('currencyBalanceId')}>
                    <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                        {currencyOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                                <div className="flex items-center justify-between w-full gap-4">
                                    <span>{opt.label}</span>
                                    <span className="text-muted-foreground text-sm">{opt.balance.toLocaleString()} {opt.currencyCode}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.currencyBalanceId && <p className="text-xs text-red-500">{errors.currencyBalanceId.message}</p>}
            </div>

            {transactionType === 'transfer' && (
                <div className="flex items-center justify-center">
                    <div className="bg-muted rounded-full p-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                </div>
            )}

            {transactionType === 'transfer' && (
                <div className="p-4 rounded-xl bg-muted/30 border space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To Account</Label>
                        {selectedToAccount && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border animate-in fade-in zoom-in duration-300">
                                Balance: {selectedToAccount.balance.toLocaleString()} {selectedToAccount.currencyCode}
                            </span>
                        )}
                    </div>
                    <Select onValueChange={(val) => setValue('toCurrencyBalanceId', val)} value={watch('toCurrencyBalanceId')}>
                        <SelectTrigger className="w-full bg-background">
                            <SelectValue placeholder="Select destination account" />
                        </SelectTrigger>
                        <SelectContent>
                            {currencyOptions.filter(opt => opt.id !== currencyBalanceId).map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                    <div className="flex items-center justify-between w-full gap-4">
                                        <span>{opt.label}</span>
                                        <span className="text-muted-foreground text-sm">{opt.balance.toLocaleString()} {opt.currencyCode}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {transactionType === 'transfer' && (
                <div className="space-y-2">
                    <Label htmlFor="fee">Transfer Fee (optional)</Label>
                    <Input id="fee" type="number" step="0.01" placeholder="0.00" {...register('fee')} />
                </div>
            )}

            {transactionType !== 'transfer' && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="categoryId">Category</Label>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto py-1 px-2 text-xs"
                            onClick={() => setShowCategoryManager(true)}
                        >
                            <Settings2 className="h-3 w-3 mr-1" />
                            Manage
                        </Button>
                    </div>
                    <Select onValueChange={(val) => setValue('categoryId', val)} value={watch('categoryId')}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select category">
                                {selectedCategory && (
                                    <div className="flex items-center gap-2">
                                        <span>{selectedCategory.icon}</span>
                                        <span>{selectedCategory.name}</span>
                                    </div>
                                )}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {filteredCategories.map((cat: Category) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                    <div className="flex items-center gap-2">
                                        <span>{cat.icon}</span>
                                        <span>{cat.name}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors.categoryId && <p className="text-xs text-red-500">{errors.categoryId.message}</p>}
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="relative">
                    <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...register('amount')}
                        className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        {selectedAccount?.currencyCode || 'KZT'}
                    </span>
                </div>
                {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
            </div>

            {transactionType === 'expense' && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
                    <Label className="flex items-center gap-2">
                        Cashback
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...register('cashbackValue')}
                            className="flex-1"
                        />
                        <Select onValueChange={(val: any) => setValue('cashbackMode', val)} defaultValue="amount">
                            <SelectTrigger className="w-24">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="amount">Fixed</SelectItem>
                                <SelectItem value="percent">%</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {watch('cashbackMode') === 'percent' && (
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Max Cashback (optional)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                placeholder="No limit"
                                {...register('cashbackMax')}
                            />
                        </div>
                    )}
                </div>
            )}

            {transactionType === 'expense' && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                            Split with others
                        </Label>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto py-1 px-2 text-xs"
                            onClick={() => setSplitEnabled(!splitEnabled)}
                        >
                            {splitEnabled ? 'Enabled' : 'Disabled'}
                        </Button>
                    </div>
                    {splitEnabled && (
                        <div>
                            <SplitSelector
                                selectedParticipants={selectedParticipants}
                                onSelectionChange={setSelectedParticipants}
                                equalSplit={equalSplit}
                                onEqualSplitChange={setEqualSplit}
                                customAmounts={customAmounts}
                                onCustomAmountsChange={setCustomAmounts}
                                transactionAmount={Number(watch('amount')) || 0}
                                includeSelf={includeSelf}
                                onIncludeSelfChange={setIncludeSelf}
                            />
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="date" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Date
                </Label>
                <Input id="date" type="date" {...register('date')} />
            </div>

            <div className="space-y-2">
                <Label htmlFor="description" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Description (optional)
                </Label>
                <Input id="description" placeholder="e.g., Grocery shopping" {...register('description')} />
            </div>

            <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                    Cancel
                </Button>
                <Button type="submit" disabled={createTransaction.isLoading} className="flex-1 gap-2">
                    {!createTransaction.isLoading && <Plus className="h-4 w-4" />}
                    {createTransaction.isLoading ? 'Adding...' : 'Add Transaction'}
                </Button>
            </div>

            {showCategoryManager && (
                <ManageCategoriesSheet
                    trigger={null}
                    defaultType={transactionType}
                />
            )}
        </form>
    );
}
