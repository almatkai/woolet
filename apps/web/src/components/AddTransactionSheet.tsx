import { useEffect, useMemo, useState, type ReactNode } from 'react';
import posthog from 'posthog-js';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Settings2, Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatAccountLabel } from '@/lib/utils';
import { ManageCategoriesSheet } from '@/components/ManageCategoriesSheet';
import { SplitSelector } from '@/components/SplitBillComponents';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, Calendar, FileText } from 'lucide-react';

interface Category {
    id: string;
    name: string;
    icon: string;
    color: string;
    type?: 'income' | 'expense' | 'transfer';
}

// Form input schema
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

interface ShortcutData {
    id: string;
    name?: string;
    icon?: string;
    type: 'income' | 'expense' | 'transfer';
    currencyBalanceId: string;
    categoryId: string;
    amount?: number;
    description?: string;
}

interface AddTransactionSheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    preselectedCurrencyBalanceId?: string;
    preselectedType?: 'income' | 'expense' | 'transfer';
    preselectedCategoryId?: string;
    preselectedAmount?: number;
    preselectedDescription?: string;
    trigger?: ReactNode | null;
    onSaveAsShortcut?: (data: Omit<ShortcutData, 'id'>) => void;
    selectedShortcut?: ShortcutData | null;
    favoriteShortcuts?: ShortcutData[];
    onOpenShortcut?: (shortcut: ShortcutData) => void;
}

export function AddTransactionSheet({
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    preselectedCurrencyBalanceId,
    preselectedType,
    preselectedCategoryId,
    preselectedAmount,
    preselectedDescription,
    trigger,
    onSaveAsShortcut,
    selectedShortcut,
    favoriteShortcuts = [],
    onOpenShortcut,
}: AddTransactionSheetProps = {}) {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = controlledOnOpenChange || setInternalOpen;
    const utils = trpc.useUtils();
    const [splitEnabled, setSplitEnabled] = useState(false);
    const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
    const [equalSplit, setEqualSplit] = useState(true);
    const [customAmounts, setCustomAmounts] = useState<{ participantId: string; amount: number }[]>([]);
    const [participantAccounts, setParticipantAccounts] = useState<{ participantId: string; paybackCurrencyBalanceId: string }[]>([]);
    const [includeSelf, setIncludeSelf] = useState(false);
    const [instantMoneyBack, setInstantMoneyBack] = useState(false);
    const [paybackCurrencyBalanceId, setPaybackCurrencyBalanceId] = useState<string>('');

    // Fetch hierarchy to select account/currency
    const { data: banks } = trpc.bank.getHierarchy.useQuery();
    const { data: categories } = trpc.category.list.useQuery();

    // Flatten hierarchy for select options
    const currencyOptions = useMemo(() => {
        if (!banks) return [];
        const options: { id: string, label: string, balance: number, currencyCode: string }[] = [];
        banks.forEach((bank: any) => {
            bank.accounts.forEach((acc: any) => {
                acc.currencyBalances.forEach((cb: any) => {
                    options.push({
                        id: cb.id,
                        label: formatAccountLabel(bank.name, acc.name, acc.last4Digits),
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
            type: preselectedType || 'expense',
            amount: '',
            fee: '',
            cashbackValue: '',
            cashbackMode: 'amount',
            cashbackMax: '',
            date: new Date().toISOString().split('T')[0],
            currencyBalanceId: preselectedCurrencyBalanceId || '',
            categoryId: '',
        }
    });

    useEffect(() => {
        if (!open) return;
        if (preselectedType) setValue('type', preselectedType);
        if (preselectedCurrencyBalanceId) setValue('currencyBalanceId', preselectedCurrencyBalanceId);
        if (preselectedCategoryId) setValue('categoryId', preselectedCategoryId);
        if (preselectedAmount !== undefined) setValue('amount', preselectedAmount ? preselectedAmount.toString() : '');
        if (preselectedDescription !== undefined) setValue('description', preselectedDescription);
    }, [
        open,
        preselectedType,
        preselectedCurrencyBalanceId,
        preselectedCategoryId,
        preselectedAmount,
        preselectedDescription,
        setValue,
    ]);

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
        categories?.find((c: Category) => c.id === categoryId),
        [categories, categoryId]);

    // Filter categories by transaction type
    const filteredCategories = useMemo(() => {
        if (!categories) return [];
        return categories.filter((cat: Category) => {
            if (transactionType === 'transfer') return true;
            return cat.type === transactionType;
        });
    }, [categories, transactionType]);

    useEffect(() => {
        if (!categoryId) return;
        const isValid = filteredCategories.some((cat: Category) => cat.id === categoryId);
        if (!isValid) {
            setValue('categoryId', '');
        }
    }, [categoryId, filteredCategories, setValue]);

    const canSaveAsShortcut = !selectedShortcut;

    const createTransaction = trpc.transaction.create.useMutation({
        onSuccess: (_data: any, variables: any) => {
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            setOpen(false);

            posthog.capture('transaction_added', {
                type: variables.type,
                amount: variables.amount,
                category_id: variables.categoryId,
                is_split: splitEnabled
            });

            reset();
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
                    participantIds: selectedParticipants,
                    equalSplit,
                    amounts: selectedParticipants.map(pid => {
                        const acc = participantAccounts.find(a => a.participantId === pid)?.paybackCurrencyBalanceId;
                        return {
                            participantId: pid,
                            amount: !equalSplit ? (customAmounts.find(a => a.participantId === pid)?.amount || 0) : 1, // 1 is placeholder if equalSplit
                            paybackCurrencyBalanceId: (acc && acc !== '__none__') ? acc : undefined,
                        };
                    }),
                    includeSelf,
                    instantMoneyBack,
                    paybackCurrencyBalanceId: (instantMoneyBack && paybackCurrencyBalanceId && paybackCurrencyBalanceId !== '__none__') ? paybackCurrencyBalanceId : undefined,
                }
            })
        };
        createTransaction.mutate(payload);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            {trigger !== null && (
                <SheetTrigger asChild>
                    {trigger ?? (
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add Transaction
                        </Button>
                    )}
                </SheetTrigger>
            )}
            <SheetContent className="flex flex-col h-full">
                <SheetHeader className="px-1">
                    <SheetTitle>Add Transaction</SheetTitle>
                    <SheetDescription>
                        Record your income, expense, or transfer.
                    </SheetDescription>
                </SheetHeader>
                {favoriteShortcuts.length > 0 && (
                    <div className="pl-0 pr-1 py-6 border-b border-border/40">
                        <div className="mb-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Starred Shortcuts</p>
                        </div>
                        <div className="flex flex-wrap gap-4">
                            {favoriteShortcuts.map((shortcut) => (
                                <button
                                    key={shortcut.id}
                                    onClick={() => onOpenShortcut?.(shortcut)}
                                    className={`flex flex-col items-center gap-2 group transition-all duration-300 ${selectedShortcut?.id === shortcut.id ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                                >
                                    <div
                                        className={`h-12 w-12 rounded-2xl flex items-center justify-center text-xl transition-all duration-300 border-2 relative overflow-hidden ${selectedShortcut?.id === shortcut.id
                                            ? 'border-primary ring-4 ring-primary/20 scale-105 shadow-md'
                                            : 'border-muted-foreground/10 hover:border-muted-foreground/20'
                                            }`}
                                        title={shortcut.name}
                                        style={{
                                            background: shortcut.type === 'income'
                                                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.05))'
                                                : shortcut.type === 'expense'
                                                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05))'
                                                    : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05))'
                                        }}
                                    >
                                        <div className="absolute inset-0 bg-white/5 group-hover:bg-white/10 transition-colors" />
                                        <span className="relative z-10 drop-shadow-sm group-hover:animate-bounce-short">
                                            {shortcut.icon || '💰'}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors max-w-[48px] truncate">
                                        {shortcut.name}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto px-1">
                    <form onSubmit={handleSubmit(onSubmit, (errors) => {
                        const errorMessages = Object.values(errors).map(e => e?.message).filter(Boolean);
                        if (errorMessages.length > 0) {
                            toast.error(`Please fill required fields: ${errorMessages.join(', ')}`);
                        }
                    })} className="space-y-6 pt-6 pb-10">
                        <Tabs defaultValue={watch('type') || 'expense'} onValueChange={(val) => setValue('type', val as 'income' | 'expense' | 'transfer')} className="w-full">
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
                            <Select
                                onValueChange={(val) => {
                                    setValue('currencyBalanceId', val);
                                    const opt = currencyOptions.find(o => o.id === val);
                                    if (opt) setValue('currencyCode', opt.currencyCode);
                                }}
                                value={watch('currencyBalanceId') || ''}
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

                        {transactionType === 'transfer' && (
                            <div className="p-4 rounded-xl bg-muted/30 border space-y-3 transition-all duration-200 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        To Account
                                    </Label>
                                    {selectedToAccount && (
                                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-background border animate-in fade-in zoom-in duration-300">
                                            Balance: {selectedToAccount.balance.toLocaleString()} {selectedToAccount.currencyCode}
                                        </span>
                                    )}
                                </div>
                                <Select
                                    onValueChange={(val) => setValue('toCurrencyBalanceId', val)}
                                    value={watch('toCurrencyBalanceId') || ''}
                                >
                                    <SelectTrigger className="h-14 bg-background">
                                        <SelectValue placeholder="Select Target Account" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {currencyOptions
                                            .filter(opt => opt.id !== currencyBalanceId)
                                            .map(opt => (
                                                <SelectItem key={opt.id} value={opt.id}>
                                                    <div className="flex flex-col items-start py-1">
                                                        <span className="font-medium text-sm">{opt.label}</span>
                                                        <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                {errors.toCurrencyBalanceId && <p className="text-sm text-red-500 mt-1">{errors.toCurrencyBalanceId.message}</p>}
                            </div>
                        )}



                        <div className="p-4 rounded-xl bg-muted/30 border space-y-3 transition-all duration-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</Label>
                                    <ManageCategoriesSheet
                                        defaultType={transactionType === 'transfer' ? undefined : transactionType}
                                        trigger={
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                type="button"
                                                className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <Settings2 className="h-3 w-3" />
                                            </Button>
                                        }
                                    />
                                </div>
                                {selectedCategory && (
                                    <span
                                        className="text-[10px] font-bold px-2 py-0.5 rounded border animate-in fade-in zoom-in duration-300 flex items-center gap-1.5"
                                        style={{
                                            backgroundColor: `${selectedCategory.color}15`,
                                            borderColor: `${selectedCategory.color}40`,
                                            color: selectedCategory.color
                                        }}
                                    >
                                        <span className="text-xs">{selectedCategory.icon}</span>
                                        {selectedCategory.name}
                                    </span>
                                )}
                            </div>
                            <Select onValueChange={(val) => setValue('categoryId', val)} value={watch('categoryId') || ''}>
                                <SelectTrigger className="h-12 bg-background border-muted-foreground/20">
                                    <SelectValue placeholder="Select Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {filteredCategories?.map((cat: Category) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            <div className="flex items-center gap-2.5 py-0.5">
                                                <div
                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-sm shadow-sm border border-transparent"
                                                    style={{ backgroundColor: `${cat.color}20` }}
                                                >
                                                    {cat.icon}
                                                </div>
                                                <span className="font-medium text-sm">{cat.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.categoryId && <p className="text-sm text-red-500 mt-1">{errors.categoryId.message}</p>}
                        </div>

                        <div className="p-4 rounded-xl bg-muted/30 border space-y-3 transition-all duration-200">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</Label>
                            <div className="relative group">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors">
                                    <span className="text-lg font-semibold">{selectedAccount?.currencyCode || '$'}</span>
                                </div>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    {...register('amount')}
                                    className="h-12 pl-14 text-lg font-semibold bg-background border-muted-foreground/20"
                                />
                            </div>
                            {errors.amount && <p className="text-sm text-red-500 mt-1">{errors.amount.message}</p>}
                        </div>

                        {transactionType === 'transfer' && (
                            <div className="space-y-2">
                                <Label htmlFor="fee" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Transfer Fee (Optional)</Label>
                                <Input id="fee" type="number" step="0.01" placeholder="0.00" {...register('fee')} className="h-10 bg-background border-muted-foreground/20" />
                                {errors.fee && <p className="text-sm text-red-500 mt-1">{errors.fee.message}</p>}
                            </div>
                        )}

                        {transactionType === 'expense' && (
                            <div className="space-y-3 border p-3 rounded-md bg-muted/20">
                                <div className="flex items-center justify-between">
                                    <Label>Cashback</Label>
                                    <div className="flex bg-muted rounded-lg p-1">
                                        <button
                                            type="button"
                                            onClick={() => setValue('cashbackMode', 'amount')}
                                            className={`text-xs px-2 py-1 rounded-md transition-all ${watch('cashbackMode') === 'amount' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}`}
                                        >
                                            Amount
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setValue('cashbackMode', 'percent')}
                                            className={`text-xs px-2 py-1 rounded-md transition-all ${watch('cashbackMode') === 'percent' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}`}
                                        >
                                            Percent %
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <Input
                                            type="number"
                                            step="0.01"
                                            placeholder={watch('cashbackMode') === 'percent' ? "e.g. 5%" : "0.00"}
                                            {...register('cashbackValue')}
                                        />
                                    </div>
                                    {watch('cashbackMode') === 'percent' && (
                                        <div className="w-1/3">
                                            <Input
                                                type="number"
                                                step="1"
                                                placeholder="Max"
                                                title="Max Limit"
                                                {...register('cashbackMax')}
                                            />
                                        </div>
                                    )}
                                </div>

                                {watch('cashbackMode') === 'percent' && watch('amount') && watch('cashbackValue') && (
                                    <p className="text-xs text-muted-foreground text-right">
                                        = {Math.min(
                                            (Number(watch('amount')) * Number(watch('cashbackValue'))) / 100,
                                            Number(watch('cashbackMax')) || Infinity
                                        ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </p>
                                )}
                            </div>
                        )}

                        {transactionType === 'expense' && (
                            <div className="space-y-3 border p-3 rounded-md bg-muted/20">
                                <div className="flex items-center justify-between">
                                    <Label>Split with others</Label>
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
                                    <SplitSelector
                                        selectedParticipants={selectedParticipants}
                                        onSelectionChange={setSelectedParticipants}
                                        equalSplit={equalSplit}
                                        onEqualSplitChange={setEqualSplit}
                                        customAmounts={customAmounts}
                                        onCustomAmountsChange={setCustomAmounts}
                                        participantAccounts={participantAccounts}
                                        onParticipantAccountsChange={setParticipantAccounts}
                                        transactionAmount={Number(watch('amount')) || 0}
                                        includeSelf={includeSelf}
                                        onIncludeSelfChange={setIncludeSelf}
                                        instantMoneyBack={instantMoneyBack}
                                        onInstantMoneyBackChange={setInstantMoneyBack}
                                        paybackCurrencyBalanceId={paybackCurrencyBalanceId}
                                        onPaybackCurrencyBalanceIdChange={setPaybackCurrencyBalanceId}
                                        currencyOptions={currencyOptions}
                                    />
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Date</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/70" />
                                    <Input id="date" type="date" {...register('date')} className="h-10 pl-9 bg-background border-muted-foreground/20" />
                                </div>
                                {errors.date && <p className="text-sm text-red-500 mt-1">{(errors.date as any).message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Description</Label>
                                <div className="relative">
                                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input id="description" placeholder="Notes..." {...register('description')} className="h-10 pl-9 bg-background border-muted-foreground/20" />
                                </div>
                                {errors.description && <p className="text-sm text-red-500 mt-1">{(errors.description as any).message}</p>}
                            </div>
                        </div>

                        <SheetFooter className="flex items-center gap-2 mt-4">
                            {onSaveAsShortcut && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-11 w-11 rounded-xl shrink-0 border-muted-foreground/20"
                                    disabled={!canSaveAsShortcut}
                                    onClick={() => {
                                        const currencyBalanceId = watch('currencyBalanceId');
                                        const categoryId = watch('categoryId');
                                        if (!currencyBalanceId || !categoryId) {
                                            toast.error('Please select account and category first');
                                            return;
                                        }
                                        onSaveAsShortcut({
                                            type: watch('type'),
                                            currencyBalanceId,
                                            categoryId,
                                            amount: watch('amount') ? Number(watch('amount')) : undefined,
                                            description: watch('description') || undefined,
                                        });
                                    }}
                                    title="Save as Shortcut"
                                >
                                    <Bookmark className="h-5 w-5 text-primary" />
                                </Button>
                            )}
                            <Button
                                type="submit"
                                className="flex-1 h-11 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all"
                                disabled={createTransaction.isLoading}
                            >
                                {!createTransaction.isLoading && <Plus className="h-4 w-4 mr-1" />}
                                {createTransaction.isLoading ? 'Adding...' : 'Add Transaction'}
                            </Button>
                        </SheetFooter>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    );
}
