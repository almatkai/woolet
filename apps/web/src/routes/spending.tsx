import { useEffect, useMemo, useRef, useState } from 'react';
import posthog from 'posthog-js';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Trash2, MoreHorizontal, Star, StarOff, Bookmark, X, Plus, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { AddTransactionSheet } from '@/components/AddTransactionSheet';
import { Card, CardContent } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';

interface SplitParticipant {
    id: string;
    name: string;
    color: string;
}

interface TransactionSplit {
    id: string;
    participantId: string;
    owedAmount: string;
    paidAmount: string;
    status: 'pending' | 'partial' | 'settled';
    participant: SplitParticipant;
}

interface Transaction {
    id: string;
    currencyBalanceId: string;
    amount: string | number;
    description?: string | null;
    date: string;
    type: string;
    category?: {
        id: string;
        name: string;
        icon: string;
    } | null;
    childTransactions?: Transaction[] | null;
    splits?: TransactionSplit[] | null;
    currencyBalance?: {
        currencyCode: string;
        account?: {
            id: string;
            name: string;
            bank?: {
                name: string;
            }
        } | null;
    } | null;
}

const editTransactionSchema = z.object({
    description: z.string().optional(),
    date: z.string().min(1, 'Date is required'),
    amount: z.string().min(1, 'Amount is required'),
    categoryId: z.string().min(1, 'Category is required'),
    currencyBalanceId: z.string().min(1, 'Account is required'),
});

type EditTransactionForm = z.infer<typeof editTransactionSchema>;

const shortcutSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    type: z.enum(['income', 'expense', 'transfer']),
    currencyBalanceId: z.string().min(1, 'Account is required'),
    categoryId: z.string().min(1, 'Category is required'),
    amount: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
});

type ShortcutForm = z.infer<typeof shortcutSchema>;

interface TransactionShortcut {
    id: string;
    name: string;
    type: 'income' | 'expense' | 'transfer';
    currencyBalanceId: string;
    categoryId: string;
    amount?: number;
    description?: string;
    icon?: string;
    isFavorite?: boolean;
}

const SHORTCUTS_STORAGE_KEY = 'woolet :transaction-macros'; // Keep same key for backward compatibility
const FAVORITES_WIDGET_KEY = 'woolet :favorites-widget-visible';

export function SpendingPage() {
    const { data: transactionsData, isLoading } = trpc.transaction.list.useQuery({ hideAdjustments: true }) as { data: { transactions: Transaction[] } | undefined, isLoading: boolean };
    const { data: banks } = trpc.bank.getHierarchy.useQuery();
    const { data: categories } = trpc.category.list.useQuery();
    const utils = trpc.useUtils();

    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [isAddingPayback, setIsAddingPayback] = useState(false);
    const [paybackAmount, setPaybackAmount] = useState('');
    const [paybackDescription, setPaybackDescription] = useState('Payback');

    const deleteTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
    const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

    const createTransaction = trpc.transaction.create.useMutation({
        onSuccess: () => {
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            toast.success('Payback added');
            setIsAddingPayback(false);
            setPaybackAmount('');
            setPaybackDescription('Payback');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to add payback');
        }
    });
    const [transactionSheetOpen, setTransactionSheetOpen] = useState(false);
    const [selectedShortcut, setSelectedShortcut] = useState<TransactionShortcut | null>(null);
    const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
    const [shortcutsListOpen, setShortcutsListOpen] = useState(false);
    const [editingShortcut, setEditingShortcut] = useState<TransactionShortcut | null>(null);
    const [shortcuts, setShortcuts] = useState<TransactionShortcut[]>([]);

    useEffect(() => {
        if (shortcuts.length > 0) {
            const favoriteCount = shortcuts.filter(s => s.isFavorite).length;
            posthog.setPersonProperties({
                total_shortcuts_count: shortcuts.length,
                favorite_shortcuts_count: favoriteCount
            });
        }
    }, [shortcuts]);

    const [favoritesWidgetVisible, setFavoritesWidgetVisible] = useState(() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(FAVORITES_WIDGET_KEY);
            return saved !== null ? JSON.parse(saved) : true;
        }
        return true;
    });

    // Record payment state
    const [recordPaymentSplit, setRecordPaymentSplit] = useState<{
        splitId: string;
        participantName: string;
        remaining: number;
        currencyCode: string;
        transactionId: string;
    } | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentAccountId, setPaymentAccountId] = useState('');
    const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set());

    const toggleSplitExpand = (txId: string) => {
        setExpandedSplits(prev => {
            const next = new Set(prev);
            if (next.has(txId)) {
                next.delete(txId);
            } else {
                next.add(txId);
            }
            return next;
        });
    };

    const recordPayment = trpc.splitBill.recordPayment.useMutation({
        onSuccess: () => {
            utils.transaction.list.invalidate();
            toast.success('Payment recorded');
            setRecordPaymentSplit(null);
            setPaymentAmount('');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setPaymentAccountId('');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to record payment');
        }
    });

    // Update editing transaction if list updates (e.g. after adding/deleting payback)
    useEffect(() => {
        if (!editingTransaction || !transactionsData) return;

        // Find in main list
        let updated = transactionsData.transactions.find(t => t.id === editingTransaction.id);

        // If not found, look in children of all transactions
        if (!updated) {
            for (const parent of transactionsData.transactions) {
                if (parent.childTransactions) {
                    const child = parent.childTransactions.find(t => t.id === editingTransaction.id);
                    if (child) {
                        updated = child;
                        break;
                    }
                }
            }
        }

        if (updated) {
            setEditingTransaction(updated);
        }
    }, [transactionsData, editingTransaction?.id]);

    const toggleFavoritesWidget = (visible: boolean) => {
        setFavoritesWidgetVisible(visible);
        localStorage.setItem(FAVORITES_WIDGET_KEY, JSON.stringify(visible));
    };

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const bottomOffset = favoritesWidgetVisible ? '150px' : '24px';
        root.style.setProperty('--toast-bottom-offset', bottomOffset);

        return () => {
            root.style.setProperty('--toast-bottom-offset', '24px');
        };
    }, [favoritesWidgetVisible]);

    const { register, handleSubmit, reset, setValue: setValueEdit, watch: watchEdit, formState: { errors } } = useForm<EditTransactionForm>({
        resolver: zodResolver(editTransactionSchema),
    });

    const {
        register: registerShortcut,
        handleSubmit: handleSubmitShortcut,
        reset: resetShortcutForm,
        setValue: setShortcutValue,
        watch: watchShortcut,
        formState: { errors: shortcutErrors },
    } = useForm<ShortcutForm>({
        resolver: zodResolver(shortcutSchema),
        defaultValues: {
            type: 'expense',
            amount: '',
            description: '',
            icon: '💰',
        },
    });

    const deleteTransaction = trpc.transaction.delete.useMutation({
        onSuccess: () => {
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
        },
        onError: (error: unknown) => {
            toast.error('Failed to delete transaction');
            console.error(error);
        }
    });

    const updateTransaction = trpc.transaction.update.useMutation({
        onSuccess: () => {
            utils.transaction.list.invalidate();
            toast.success('Transaction updated');
            setEditingTransaction(null);
            reset();
        },
        onError: (error: unknown) => {
            toast.error('Failed to update transaction');
            console.error(error);
        }
    });

    const handleEdit = (transaction: Transaction) => {
        setEditingTransaction(transaction);
        reset({
            description: transaction.description || '',
            date: transaction.date.split('T')[0],
            amount: transaction.amount.toString(),
            categoryId: transaction.category?.id || '',
            currencyBalanceId: transaction.currencyBalanceId,
        });
    };

    const onSubmitEdit = (data: EditTransactionForm) => {
        if (!editingTransaction) return;
        updateTransaction.mutate({
            id: editingTransaction.id,
            description: data.description,
            date: data.date,
            amount: Number(data.amount),
            categoryId: data.categoryId,
            currencyBalanceId: data.currencyBalanceId,
        });
    };

    useEffect(() => {
        const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as TransactionShortcut[];
            // Backward compatibility: add default icon and favorite if missing
            const migrated = parsed.map((s) => ({
                ...s,
                icon: s.icon || '💰',
                isFavorite: s.isFavorite ?? false,
            }));
            setShortcuts(migrated);
        } catch {
            localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
        }
    }, []);

    const persistShortcuts = (next: TransactionShortcut[]) => {
        setShortcuts(next);
        localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(next));
    };

    const currencyOptions = useMemo(() => {
        if (!banks) return [];
        const options: { id: string; label: string; currencyCode: string }[] = [];
        banks.forEach((bank: { name: string; accounts: any[] }) => {
            bank.accounts.forEach((acc: { name: string; currencyBalances: any[] }) => {
                acc.currencyBalances.forEach((cb: { id: string; balance: string | number; currencyCode: string }) => {
                    options.push({
                        id: cb.id,
                        label: `[${bank.name}] ${acc.name} `,
                        currencyCode: cb.currencyCode,
                    });
                });
            });
        });
        return options;
    }, [banks]);

    const accountLabelById = useMemo(() => {
        return new Map<string, string>(currencyOptions.map((opt) => [opt.id, opt.label]));
    }, [currencyOptions]);

    const categoryLabelById = useMemo(() => {
        return new Map<string, string>((categories || []).map((cat: { id: string; name: string; icon: string }) => [cat.id, `${cat.icon} ${cat.name} `]));
    }, [categories]);

    const handleCreateShortcut = (data: ShortcutForm) => {
        const amountValue = data.amount ? Number(data.amount) : undefined;
        const newShortcut: TransactionShortcut = {
            id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()} -${Math.random()} `,
            name: data.name.trim(),
            type: data.type,
            currencyBalanceId: data.currencyBalanceId,
            categoryId: data.categoryId,
            amount: amountValue && amountValue > 0 ? amountValue : undefined,
            description: data.description?.trim() || undefined,
            icon: data.icon || '💰',
            isFavorite: false,
        };
        persistShortcuts([newShortcut, ...shortcuts]);
        setShortcutSheetOpen(false);
        setEditingShortcut(null);
        resetShortcutForm();
        toast.success('Shortcut saved');
    };

    const handleUpdateShortcut = (data: ShortcutForm) => {
        if (!editingShortcut) return;
        const amountValue = data.amount ? Number(data.amount) : undefined;
        const updated: TransactionShortcut = {
            ...editingShortcut,
            name: data.name.trim(),
            type: data.type,
            currencyBalanceId: data.currencyBalanceId,
            categoryId: data.categoryId,
            amount: amountValue && amountValue > 0 ? amountValue : undefined,
            description: data.description?.trim() || undefined,
            icon: data.icon || '💰',
        };
        persistShortcuts(shortcuts.map((s) => (s.id === editingShortcut.id ? updated : s)));
        setShortcutSheetOpen(false);
        setEditingShortcut(null);
        resetShortcutForm();
        toast.success('Shortcut updated');
    };

    const handleDeleteShortcut = (shortcutId: string) => {
        persistShortcuts(shortcuts.filter((s) => s.id !== shortcutId));
        toast.success('Shortcut removed');
    };

    const toggleFavorite = (shortcutId: string) => {
        const currentFavorites = shortcuts.filter((s) => s.isFavorite && s.id !== shortcutId).length;
        const shortcut = shortcuts.find((s) => s.id === shortcutId);
        if (!shortcut) return;

        if (!shortcut.isFavorite && currentFavorites >= 4) {
            toast.error('Maximum 4 favorites allowed. Remove one first.');
            return;
        }

        persistShortcuts(
            shortcuts.map((s) =>
                s.id === shortcutId ? { ...s, isFavorite: !s.isFavorite } : s
            )
        );
        toast.success(shortcut.isFavorite ? 'Removed from favorites' : 'Added to favorites');
    };

    const openShortcut = (shortcut: TransactionShortcut) => {
        setSelectedShortcut(shortcut);
        setTransactionSheetOpen(true);
        posthog.capture('shortcut_opened', {
            shortcut_id: shortcut.id,
            shortcut_name: shortcut.name,
            shortcut_type: shortcut.type
        });
    };

    const openEditShortcut = (shortcut: TransactionShortcut) => {
        setEditingShortcut(shortcut);
        setShortcutValue('name', shortcut.name);
        setShortcutValue('type', shortcut.type);
        setShortcutValue('currencyBalanceId', shortcut.currencyBalanceId);
        setShortcutValue('categoryId', shortcut.categoryId);
        setShortcutValue('amount', shortcut.amount?.toString() || '');
        setShortcutValue('description', shortcut.description || '');
        setShortcutValue('icon', shortcut.icon || '💰');
        setShortcutSheetOpen(true);
    };

    const favoriteShortcuts = shortcuts.filter((s) => s.isFavorite).slice(0, 4);

    const handleDelete = (transaction: Transaction) => {
        const label = transaction.description || transaction.category?.name || 'Transaction';
        setPendingDeletes(prev => new Set(prev).add(transaction.id));

        toast(`"${label}" deleted`, {
            action: {
                label: 'Undo',
                onClick: () => {
                    const timeout = deleteTimeoutRef.current.get(transaction.id);
                    if (timeout) {
                        clearTimeout(timeout);
                        deleteTimeoutRef.current.delete(transaction.id);
                    }
                    setPendingDeletes(prev => {
                        const next = new Set(prev);
                        next.delete(transaction.id);
                        return next;
                    });
                    toast.success('Transaction restored');
                },
            },
            duration: 5000,
        });

        const timeout = setTimeout(() => {
            deleteTransaction.mutate({ id: transaction.id });
            deleteTimeoutRef.current.delete(transaction.id);
            setPendingDeletes(prev => {
                const next = new Set(prev);
                next.delete(transaction.id);
                return next;
            });
        }, 5000);

        deleteTimeoutRef.current.set(transaction.id, timeout);
    };

    const visibleTransactions = transactionsData?.transactions.filter(t => !pendingDeletes.has(t.id)) || [];

    return (
        <div className={`space - y - 4 md: space - y - 6 ${favoritesWidgetVisible ? 'pb-32' : ''} `}>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">Spending</h1>
                    <p className="text-sm md:text-base text-muted-foreground">Track your daily expenses</p>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                    {/* Shortcuts button */}
                    <Button
                        variant="outline"
                        onClick={() => setShortcutsListOpen(true)}
                        title="Shortcuts"
                    >
                        <Bookmark className="h-4 w-4" />
                        Shortcuts
                    </Button>
                    <AddTransactionSheet
                        open={transactionSheetOpen}
                        onOpenChange={(nextOpen) => {
                            setTransactionSheetOpen(nextOpen);
                            if (!nextOpen) setSelectedShortcut(null);
                        }}
                        preselectedCurrencyBalanceId={selectedShortcut?.currencyBalanceId}
                        preselectedType={selectedShortcut?.type}
                        preselectedCategoryId={selectedShortcut?.categoryId}
                        preselectedAmount={selectedShortcut?.amount}
                        preselectedDescription={selectedShortcut?.description}
                        selectedShortcut={selectedShortcut}
                        onSaveAsShortcut={(data) => {
                            setShortcutValue('type', data.type);
                            setShortcutValue('currencyBalanceId', data.currencyBalanceId);
                            setShortcutValue('categoryId', data.categoryId);
                            setShortcutValue('amount', data.amount?.toString() || '');
                            setShortcutValue('description', data.description || '');
                            setShortcutValue('name', '');
                            setShortcutValue('icon', '💰');
                            setEditingShortcut(null);
                            setShortcutSheetOpen(true);
                        }}
                        trigger={(
                            <Button className="gap-2" onClick={() => setSelectedShortcut(null)}>
                                Add Transaction
                            </Button>
                        )}
                    />
                </div>
            </div>

            <Card>
                <CardContent className="p-4 md:p-6">
                    {isLoading ? (
                        <p className="text-muted-foreground text-center py-8">Loading transactions...</p>
                    ) : visibleTransactions.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                            No transactions yet. Add your first transaction to get started.
                        </p>
                    ) : (
                        <div className="space-y-3 md:space-y-4">
                            {visibleTransactions.map((tx: Transaction) => (
                                <div key={tx.id} className="space-y-2 border-b last:border-0 pb-3 md:pb-4 group">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 md:gap-3">
                                            <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-muted flex items-center justify-center text-base md:text-lg">
                                                {tx.category?.icon || '📄'}
                                            </div>
                                            <div>
                                                <p className="text-sm md:text-base font-medium">{tx.description || tx.category?.name || 'Unknown'}</p>
                                                <div className="flex gap-1 md:gap-2 text-[10px] md:text-xs text-muted-foreground">
                                                    <span>{new Date(tx.date).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span className="truncate max-w-[100px] md:max-w-none">
                                                        {tx.currencyBalance?.account?.bank?.name ? `[${tx.currencyBalance.account.bank.name}]` : ''}
                                                        {tx.currencyBalance?.account?.name || 'Unknown Account'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 md:gap-2">
                                            <div className="flex flex-col items-end">
                                                <span className={`text - sm md: text - base font - semibold ${tx.type === 'income' ? 'text-green-600' : tx.type === 'expense' ? 'text-red-600' : 'text-foreground'} `}>
                                                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                                                    {Math.abs(Number(tx.amount)).toLocaleString('en-US', { style: 'currency', currency: tx.currencyBalance?.currencyCode || 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </span>
                                                {tx.type === 'expense' && tx.splits && tx.splits.length > 0 && (() => {
                                                    // Calculate how much has been paid back from splits
                                                    // For settled splits, use owedAmount (fully paid)
                                                    // For partial/pending, use paidAmount
                                                    const totalPaidBack = tx.splits.reduce((acc: number, s: TransactionSplit) => {
                                                        if (s.status === 'settled') {
                                                            return acc + Number(s.owedAmount || 0);
                                                        }
                                                        return acc + Number(s.paidAmount || 0);
                                                    }, 0);
                                                    const netSpend = Math.abs(Number(tx.amount)) - totalPaidBack;
                                                    return (
                                                        <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                                                            Net Spend: {tx.currencyBalance?.currencyCode} {netSpend.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEdit(tx)}>
                                                        <Pencil className="h-4 w-4 mr-2" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(tx)}
                                                        className="text-red-600 focus:text-red-600"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>

                                    {/* Split Bill Details - Collapsible */}
                                    {tx.type === 'expense' && tx.splits && tx.splits.length > 0 && (
                                        <div className="ml-10">
                                            <button
                                                onClick={() => toggleSplitExpand(tx.id)}
                                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                {expandedSplits.has(tx.id) ? (
                                                    <ChevronUp className="h-3 w-3" />
                                                ) : (
                                                    <ChevronDown className="h-3 w-3" />
                                                )}
                                                <span>
                                                    Split with {tx.splits.length} {tx.splits.length === 1 ? 'person' : 'people'}
                                                    {(() => {
                                                        const pendingCount = tx.splits.filter((s: TransactionSplit) => s.status !== 'settled').length;
                                                        const settledCount = tx.splits.length - pendingCount;
                                                        if (settledCount === tx.splits.length) {
                                                            return <span className="text-green-600 ml-1">• All settled</span>;
                                                        } else if (pendingCount > 0) {
                                                            const pendingTotal = tx.splits
                                                                .filter((s: TransactionSplit) => s.status !== 'settled')
                                                                .reduce((acc: number, s: TransactionSplit) => acc + (Number(s.owedAmount) - Number(s.paidAmount)), 0);
                                                            return <span className="text-orange-500 ml-1">• {tx.currencyBalance?.currencyCode} {pendingTotal.toLocaleString()} pending</span>;
                                                        }
                                                        return null;
                                                    })()}
                                                </span>
                                            </button>

                                            {expandedSplits.has(tx.id) && (
                                                <div className="mt-2 space-y-2 border-l-2 pl-4 py-1">
                                                    {tx.splits.map((split) => {
                                                        const owed = Number(split.owedAmount);
                                                        const paid = Number(split.paidAmount);
                                                        const remaining = owed - paid;
                                                        return (
                                                            <div key={split.id} className="flex items-center justify-between group/split">
                                                                <div className="flex items-center gap-2">
                                                                    <div
                                                                        className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] text-white font-medium"
                                                                        style={{ backgroundColor: split.participant?.color || '#6366f1' }}
                                                                    >
                                                                        {(split.participant?.name || '??').slice(0, 2).toUpperCase()}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-medium">{split.participant?.name || 'Unknown'}</p>
                                                                        <p className="text-[10px] text-muted-foreground">
                                                                            {split.status === 'settled'
                                                                                ? `Paid ${owed.toLocaleString()} `
                                                                                : split.status === 'partial'
                                                                                    ? `Paid ${paid.toLocaleString()} of ${owed.toLocaleString()} `
                                                                                    : `Owes ${owed.toLocaleString()} `}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {split.status === 'settled' ? (
                                                                        <span className="text-xs font-semibold text-green-600">✓ Settled</span>
                                                                    ) : (
                                                                        <>
                                                                            <span className="text-xs font-semibold text-orange-500">
                                                                                {tx.currencyBalance?.currencyCode} {remaining.toLocaleString()}
                                                                            </span>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-6 text-xs"
                                                                                onClick={() => {
                                                                                    setPaymentAmount(String(remaining));
                                                                                    setRecordPaymentSplit({
                                                                                        splitId: split.id,
                                                                                        participantName: split.participant?.name || 'Unknown',
                                                                                        remaining,
                                                                                        currencyCode: tx.currencyBalance?.currencyCode || 'USD',
                                                                                        transactionId: tx.id
                                                                                    });
                                                                                }}
                                                                            >
                                                                                Record Payment
                                                                            </Button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit Transaction Sheet */}
            <Sheet open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Edit Transaction</SheetTitle>
                        <SheetDescription>
                            Update transaction details.
                        </SheetDescription>
                    </SheetHeader>
                    <form onSubmit={handleSubmit(onSubmitEdit)} className="space-y-6 pt-6">
                        <div className="space-y-2">
                            <Label>Account</Label>
                            <Select
                                onValueChange={(val) => {
                                    setValueEdit('currencyBalanceId', val);
                                }}
                                value={watchEdit('currencyBalanceId')}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencyOptions.map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            {opt.label} • {opt.currencyCode}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.currencyBalanceId && <p className="text-sm text-red-500">{errors.currencyBalanceId.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-amount">Amount</Label>
                            <div className="relative">
                                <Input
                                    id="edit-amount"
                                    type="number"
                                    step="0.01"
                                    {...register('amount')}
                                    className="pr-12"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                    {editingTransaction?.currencyBalance?.currencyCode}
                                </span>
                            </div>
                            {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select
                                onValueChange={(val) => {
                                    setValueEdit('categoryId', val);
                                }}
                                value={watchEdit('categoryId')}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories?.filter((c: { id: string; name: string; icon: string; type: string }) => c.type === editingTransaction?.type || editingTransaction?.type === 'transfer').map((cat: { id: string; name: string; icon: string }) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            <div className="flex items-center gap-2">
                                                <span>{cat.icon}</span>
                                                <span>{cat.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.categoryId && <p className="text-sm text-red-500">{errors.categoryId.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-description">Description</Label>
                            <Input id="edit-description" placeholder="Notes" {...register('description')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-date">Date</Label>
                            <Input id="edit-date" type="date" {...register('date')} />
                            {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
                        </div>

                        <div className="space-y-4 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Paybacks</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs gap-1"
                                    onClick={() => setIsAddingPayback(!isAddingPayback)}
                                >
                                    {isAddingPayback ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                    {isAddingPayback ? 'Cancel' : 'Add Payback'}
                                </Button>
                            </div>

                            {isAddingPayback && (
                                <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Input
                                                placeholder="Amount"
                                                type="number"
                                                value={paybackAmount}
                                                onChange={(e) => setPaybackAmount(e.target.value)}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div className="flex-[2]">
                                            <Input
                                                placeholder="Payback from..."
                                                value={paybackDescription}
                                                onChange={(e) => setPaybackDescription(e.target.value)}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            size="icon"
                                            className="h-8 w-8 shrink-0"
                                            disabled={!paybackAmount || createTransaction.isLoading}
                                            onClick={() => {
                                                if (!editingTransaction) return;
                                                const incomeCat = categories?.find((c: { type: string }) => c.type === 'income');
                                                if (!incomeCat) {
                                                    toast.error('No income category found. Please create one first.');
                                                    return;
                                                }
                                                createTransaction.mutate({
                                                    type: 'income',
                                                    amount: Number(paybackAmount),
                                                    description: paybackDescription,
                                                    date: editingTransaction.date,
                                                    currencyBalanceId: editingTransaction.currencyBalanceId,
                                                    categoryId: incomeCat.id,
                                                    parentTransactionId: editingTransaction.id
                                                });
                                            }}
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {editingTransaction?.childTransactions && editingTransaction.childTransactions.length > 0 && (
                                <div className="space-y-2">
                                    {editingTransaction.childTransactions.map(child => (
                                        <div key={child.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 group/item">
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-600">
                                                    {child.category?.icon || '💰'}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium leading-none">{child.description}</span>
                                                    <span className="text-[10px] text-muted-foreground mt-1">
                                                        {child.currencyBalance?.account?.bank?.name} • {child.currencyBalance?.account?.name}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-green-600">
                                                    +{Number(child.amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity"
                                                    onClick={() => {
                                                        if (confirm('Delete this payback?')) {
                                                            deleteTransaction.mutate({ id: child.id });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {editingTransaction && (
                                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex justify-between items-center">
                                    <span className="text-sm font-medium">Net Personal Spend:</span>
                                    <span className="text-lg font-bold text-primary">
                                        {(editingTransaction?.currencyBalance?.currencyCode || 'KZT')} {(Number(watchEdit('amount')) - (editingTransaction.childTransactions || []).reduce((sum, t) => sum + Number(t.amount), 0)).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                    </span>
                                </div>
                            )}
                        </div>

                        <SheetFooter>
                            <SheetClose asChild>
                                <Button variant="outline" type="button">Cancel</Button>
                            </SheetClose>
                            <Button type="submit">
                                Save Changes
                            </Button>
                        </SheetFooter>
                    </form>
                </SheetContent>
            </Sheet>

            {/* Create/Edit Shortcut Sheet */}
            <Sheet open={shortcutSheetOpen} onOpenChange={(open) => {
                setShortcutSheetOpen(open);
                if (!open) {
                    setEditingShortcut(null);
                    resetShortcutForm();
                }
            }}>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>{editingShortcut ? 'Edit Shortcut' : 'Save as Shortcut'}</SheetTitle>
                        <SheetDescription>Store this transaction to reuse later.</SheetDescription>
                    </SheetHeader>
                    <form onSubmit={handleSubmitShortcut(editingShortcut ? handleUpdateShortcut : handleCreateShortcut)} className="space-y-6 pt-6">
                        <div className="space-y-2">
                            <Label>Shortcut Name</Label>
                            <Input placeholder="Bus ride" {...registerShortcut('name')} />
                            {shortcutErrors.name && <p className="text-sm text-red-500">{shortcutErrors.name.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Icon</Label>
                            <div className="flex flex-wrap gap-2">
                                {['💰', '🚌', '🍔', '☕', '🛒', '💳', '🏠', '⚡', '📱', '🎮', '✈️', '🎬', '💊', '📚', '🎁', '🚗'].map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => setShortcutValue('icon', emoji)}
                                        className={`h - 10 w - 10 rounded - full flex items - center justify - center text - lg border - 2 transition - colors ${watchShortcut('icon') === emoji
                                                ? 'border-primary bg-primary/10'
                                                : 'border-muted hover:border-muted-foreground/50'
                                            } `}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select
                                onValueChange={(val) => setShortcutValue('type', val as ShortcutForm['type'])}
                                value={watchShortcut('type')}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="expense">Expense</SelectItem>
                                    <SelectItem value="income">Income</SelectItem>
                                    <SelectItem value="transfer">Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Account</Label>
                            <Select onValueChange={(val) => setShortcutValue('currencyBalanceId', val)} value={watchShortcut('currencyBalanceId')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencyOptions.map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            {opt.label} • {opt.currencyCode}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {shortcutErrors.currencyBalanceId && <p className="text-sm text-red-500">{shortcutErrors.currencyBalanceId.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select onValueChange={(val) => setShortcutValue('categoryId', val)} value={watchShortcut('categoryId')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories?.map((cat: any) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {cat.icon} {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {shortcutErrors.categoryId && <p className="text-sm text-red-500">{shortcutErrors.categoryId.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Default Amount (optional)</Label>
                            <Input type="number" step="0.01" placeholder="0.00" {...registerShortcut('amount')} />
                        </div>

                        <div className="space-y-2">
                            <Label>Description (optional)</Label>
                            <Input placeholder="Notes" {...registerShortcut('description')} />
                        </div>

                        <SheetFooter>
                            <SheetClose asChild>
                                <Button type="button" variant="outline">Cancel</Button>
                            </SheetClose>
                            <Button type="submit">{editingShortcut ? 'Update Shortcut' : 'Save Shortcut'}</Button>
                        </SheetFooter>
                    </form>
                </SheetContent>
            </Sheet>

            {/* Shortcuts List Sheet */}
            <Sheet open={shortcutsListOpen} onOpenChange={setShortcutsListOpen}>
                <SheetContent className="w-full sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <Bookmark className="h-5 w-5" />
                            Shortcuts
                        </SheetTitle>
                        <SheetDescription className="flex items-center justify-between">
                            <span>Quick access to your saved transactions. Star up to 4 to pin them.</span>
                            <div className="flex items-center gap-2 border rounded-full px-3 py-1 bg-muted/30">
                                <span className="text-[10px] font-medium uppercase text-muted-foreground whitespace-nowrap">Floating Widget</span>
                                <Switch
                                    checked={favoritesWidgetVisible}
                                    onCheckedChange={toggleFavoritesWidget}
                                    className="scale-75"
                                />
                            </div>
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-2">
                        {shortcuts.length === 0 ? (
                            <div className="text-center py-12">
                                <Bookmark className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                                <p className="text-muted-foreground text-sm">No shortcuts yet</p>
                                <p className="text-muted-foreground text-xs mt-1">Create one from Add Transaction</p>
                            </div>
                        ) : (
                            shortcuts.map((shortcut) => (
                                <div
                                    key={shortcut.id}
                                    className={`flex items - center gap - 3 p - 3 rounded - lg border transition - all group ${selectedShortcut?.id === shortcut.id && transactionSheetOpen
                                            ? 'bg-primary/10 border-primary/50 shadow-md'
                                            : 'bg-card hover:bg-muted/50 border-border'
                                        } `}
                                >
                                    <button
                                        onClick={() => {
                                            openShortcut(shortcut);
                                            setShortcutsListOpen(false);
                                        }}
                                        className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-xl shrink-0 hover:bg-muted/80 transition-colors"
                                    >
                                        {shortcut.icon || '💰'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            openShortcut(shortcut);
                                            setShortcutsListOpen(false);
                                        }}
                                        className="flex-1 min-w-0 text-left"
                                    >
                                        <p className="font-medium truncate">{shortcut.name}</p>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                            <span className={`px - 1.5 py - 0.5 rounded text - [10px] font - medium uppercase ${shortcut.type === 'expense' ? 'bg-red-500/10 text-red-500' :
                                                    shortcut.type === 'income' ? 'bg-green-500/10 text-green-500' :
                                                        'bg-blue-500/10 text-blue-500'
                                                } `}>
                                                {shortcut.type}
                                            </span>
                                            <span className="truncate">{categoryLabelById.get(shortcut.categoryId) || 'Category'}</span>
                                            {shortcut.amount !== undefined && (
                                                <span className="font-medium">{shortcut.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                            )}
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className={`h - 8 w - 8 ${shortcut.isFavorite ? 'text-yellow-500' : 'opacity-0 group-hover:opacity-100'} `}
                                            onClick={() => toggleFavorite(shortcut.id)}
                                        >
                                            {shortcut.isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                            onClick={() => {
                                                openEditShortcut(shortcut);
                                                setShortcutsListOpen(false);
                                            }}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteShortcut(shortcut.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Record Payment Sheet */}
            <Sheet open={!!recordPaymentSplit} onOpenChange={(open) => !open && setRecordPaymentSplit(null)}>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Record Payment</SheetTitle>
                        <SheetDescription>
                            Record payment from {recordPaymentSplit?.participantName}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label>Amount ({recordPaymentSplit?.currencyCode})</Label>
                            <Input
                                type="number"
                                placeholder={`Remaining: ${recordPaymentSplit?.remaining?.toLocaleString()} `}
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Remaining: {recordPaymentSplit?.currencyCode} {recordPaymentSplit?.remaining?.toLocaleString()}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Input
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Receive to Account</Label>
                            <Select
                                value={paymentAccountId}
                                onValueChange={setPaymentAccountId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {banks?.map((bank: any) =>
                                        bank.accounts?.map((account: any) =>
                                            account.currencyBalances?.map((cb: any) => (
                                                <SelectItem key={cb.id} value={cb.id}>
                                                    [{bank.name}] {account.name} ({cb.currencyCode})
                                                </SelectItem>
                                            ))
                                        )
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-2 pt-4">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setRecordPaymentSplit(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1"
                                disabled={!paymentAmount || !paymentAccountId || recordPayment.isPending}
                                onClick={() => {
                                    if (!recordPaymentSplit || !paymentAmount || !paymentAccountId) return;
                                    recordPayment.mutate({
                                        splitId: recordPaymentSplit.splitId,
                                        amount: parseFloat(paymentAmount),
                                        receivedToCurrencyBalanceId: paymentAccountId,
                                        createIncomeTransaction: true,
                                    });
                                }}
                            >
                                {recordPayment.isPending ? 'Recording...' : 'Record Payment'}
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Floating Favorites Widget */}
            {favoritesWidgetVisible && (
                <div className="fixed bottom-6 right-6 z-[100]">
                    <div className="bg-card border border-border rounded-2xl shadow-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold">Starred Shortcuts</p>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => toggleFavoritesWidget(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        {favoriteShortcuts.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-xs text-muted-foreground max-w-xs">
                                    Here your Starred shortcuts will appear
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {favoriteShortcuts.map((shortcut) => (
                                    <button
                                        key={shortcut.id}
                                        onClick={() => openShortcut(shortcut)}
                                        className={`h - 12 w - 12 rounded - full flex items - center justify - center text - lg transition - all border ${selectedShortcut?.id === shortcut.id && transactionSheetOpen
                                                ? 'bg-primary border-primary text-primary-foreground scale-110 shadow-lg'
                                                : 'bg-muted hover:bg-muted/80 border-border/50 hover:border-border'
                                            } `}
                                        title={shortcut.name}
                                    >
                                        {shortcut.icon || '💰'}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
