import { useState, useMemo } from 'react';
import { ArrowRightLeft, TrendingUp, TrendingDown, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ManageCategoriesSheet } from './ManageCategoriesSheet';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface AccountActionsSheetProps {
    currencyBalanceId: string;
    currencyCode: string;
    accountName: string;
    currentBalance: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type ActionType = 'income' | 'expense' | 'transfer' | 'adjust' | null;

export function AccountActionsSheet({
    currencyBalanceId,
    currencyCode,
    accountName,
    currentBalance,
    open,
    onOpenChange,
}: AccountActionsSheetProps) {
    const [selectedAction, setSelectedAction] = useState<ActionType>('transfer');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [newBalance, setNewBalance] = useState('');
    const [adjustReason, setAdjustReason] = useState('');
    const [toCurrencyBalanceId, setToCurrencyBalanceId] = useState('');
    const [fee, setFee] = useState('');

    const utils = trpc.useUtils();
    const { data: categories } = trpc.category.list.useQuery();
    const { data: banks } = trpc.bank.getHierarchy.useQuery();

    // Get all currency balance options for transfers
    const currencyOptions = useMemo(() => {
        if (!banks) return [];
        const options: { id: string, label: string }[] = [];
        banks.forEach((bank: any) => {
            bank.accounts.forEach((acc: any) => {
                acc.currencyBalances.forEach((cb: any) => {
                    if (cb.currencyCode === currencyCode) { // Same currency only
                        options.push({
                            id: cb.id,
                            label: `[${bank.name}${acc.last4Digits ? ` ${acc.last4Digits}` : ''}] ${acc.name} - ${cb.currencyCode}`
                        });
                    }
                });
            });
        });
        return options;
    }, [banks, currencyCode]);

    const createTransaction = trpc.transaction.create.useMutation({
        onSuccess: () => {
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
            toast.success('Transaction added successfully');
            resetAndClose();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create transaction');
        }
    });

    const adjustBalance = trpc.account.adjustBalance.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            utils.account.getTotalBalance.invalidate();
            toast.success('Balance adjusted successfully');
            resetAndClose();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to adjust balance');
        }
    });

    // Reset and use defaults when opening or changing action
    const resetAndClose = () => {
        setSelectedAction('transfer');
        setAmount('');
        setDescription('');
        setCategoryId('');
        setDate(new Date().toISOString().split('T')[0]);
        setNewBalance('');
        setAdjustReason('');
        setToCurrencyBalanceId('');
        setFee('');
        onOpenChange(false);
    };

    const handleSubmit = () => {
        if (selectedAction === 'adjust') {
            const balanceValue = Number(newBalance);
            if (isNaN(balanceValue)) {
                toast.error('Please enter a valid number');
                return;
            }
            adjustBalance.mutate({
                currencyBalanceId,
                newBalance: balanceValue,
                reason: adjustReason || undefined,
            });
        } else if (selectedAction === 'income' || selectedAction === 'expense' || selectedAction === 'transfer') {
            if (!amount || !categoryId) {
                toast.error('Please fill in all required fields');
                return;
            }

            const payload: any = {
                currencyBalanceId,
                categoryId,
                amount: Number(amount),
                type: selectedAction,
                description,
                date,
            };

            if (selectedAction === 'transfer') {
                if (!toCurrencyBalanceId) {
                    toast.error('Please select a destination account');
                    return;
                }
                payload.toCurrencyBalanceId = toCurrencyBalanceId;
                payload.fee = fee ? Number(fee) : 0;
            }

            createTransaction.mutate(payload);
        }
    };

    const formattedBalance = currentBalance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    const isLoading = createTransaction.isLoading || adjustBalance.isLoading;

    const actions = [
        {
            id: 'transfer' as ActionType,
            label: 'Transfer Money',
            description: 'Move between accounts',
            icon: ArrowRightLeft,
            iconBg: 'bg-blue-500/10',
            iconColor: 'text-blue-600',
        },
        {
            id: 'adjust' as ActionType,
            label: 'Adjust Balance',
            description: 'Manually correct balance',
            icon: Edit3,
            iconBg: 'bg-orange-500/10',
            iconColor: 'text-orange-600',
        },
        {
            id: 'expense' as ActionType,
            label: 'Add Expense',
            description: 'Record money spent',
            icon: TrendingDown,
            iconBg: 'bg-red-500/10',
            iconColor: 'text-red-600',
        },
        {
            id: 'income' as ActionType,
            label: 'Add Income',
            description: 'Record money received',
            icon: TrendingUp,
            iconBg: 'bg-green-500/10',
            iconColor: 'text-green-600',
        },
    ];

    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) resetAndClose(); else onOpenChange(o); }}>
            <SheetContent className="sm:max-w-[700px]">
                <SheetHeader>
                    <SheetTitle>Account Actions</SheetTitle>
                    <SheetDescription>
                        {accountName} • {currencyCode} {formattedBalance}
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex gap-6 h-[calc(100vh-200px)]">
                    {/* Left column - Action buttons */}
                    <div className="w-48 space-y-2 flex-shrink-0">
                        {actions.map((action) => {
                            const Icon = action.icon;
                            const isSelected = selectedAction === action.id;
                            return (
                                <button
                                    key={action.id}
                                    onClick={() => {
                                        setSelectedAction(action.id);
                                        if (action.id === 'adjust') {
                                            setNewBalance(currentBalance.toString());
                                        }
                                    }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${isSelected
                                        ? 'bg-primary/10 border-2 border-primary'
                                        : 'hover:bg-muted border-2 border-transparent'
                                        }`}
                                >
                                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${action.iconBg}`}>
                                        <Icon className={`h-4 w-4 ${action.iconColor}`} />
                                    </div>
                                    <div>
                                        <span className="font-medium text-sm block">{action.label}</span>
                                        <span className="text-xs text-muted-foreground">{action.description}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Right column - Action form */}
                    <div className="flex-1 border-l pl-6">
                        {!selectedAction ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                Select an action from the left
                            </div>
                        ) : selectedAction === 'adjust' ? (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg">Adjust Balance</h3>
                                <div className="space-y-2">
                                    <Label>Current Balance</Label>
                                    <Input
                                        value={`${currencyCode} ${formattedBalance}`}
                                        disabled
                                        className="bg-muted"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>New Balance *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={newBalance}
                                        onChange={(e) => setNewBalance(e.target.value)}
                                        placeholder="Enter new balance"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Reason (Optional)</Label>
                                    <Textarea
                                        value={adjustReason}
                                        onChange={(e) => setAdjustReason(e.target.value)}
                                        placeholder="e.g., Bank reconciliation"
                                        rows={3}
                                    />
                                </div>
                                <Button onClick={handleSubmit} disabled={isLoading} className="w-full">
                                    {isLoading ? 'Adjusting...' : 'Adjust Balance'}
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg">
                                    {selectedAction === 'income' && 'Add Income'}
                                    {selectedAction === 'expense' && 'Add Expense'}
                                    {selectedAction === 'transfer' && 'Transfer Money'}
                                </h3>

                                {selectedAction === 'transfer' && (
                                    <div className="space-y-2">
                                        <Label>To Account *</Label>
                                        <Select onValueChange={setToCurrencyBalanceId} value={toCurrencyBalanceId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select destination" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {currencyOptions
                                                    .filter(opt => opt.id !== currencyBalanceId)
                                                    .map(opt => (
                                                        <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label>Amount *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                    />
                                </div>

                                {selectedAction === 'transfer' && (
                                    <div className="space-y-2">
                                        <Label>Transfer Fee (Optional)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={fee}
                                            onChange={(e) => setFee(e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Category *</Label>
                                        <ManageCategoriesSheet />
                                    </div>
                                    <Select onValueChange={setCategoryId} value={categoryId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories?.map((cat: any) => (
                                                <SelectItem key={cat.id} value={cat.id}>
                                                    <span className="flex items-center gap-2">
                                                        <span>{cat.icon}</span>
                                                        <span>{cat.name}</span>
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Date *</Label>
                                    <Input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Description (Optional)</Label>
                                    <Input
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="e.g., Coffee at Starbucks"
                                    />
                                </div>

                                <Button onClick={handleSubmit} disabled={isLoading} className="w-full">
                                    {isLoading ? 'Processing...' :
                                        selectedAction === 'income' ? 'Add Income' :
                                            selectedAction === 'expense' ? 'Add Expense' :
                                                'Transfer Money'
                                    }
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
