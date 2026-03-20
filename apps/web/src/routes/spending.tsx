import { useEffect, useMemo, useRef, useState } from 'react';
import posthog from 'posthog-js';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Trash2, MoreHorizontal, Star, StarOff, Bookmark, X, Plus, Check, ChevronDown, ChevronUp, UserCheck, XCircle, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatAccountLabel } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import {
    applyBalanceDeltas,
    buildBalanceDeltasForTransaction,
    captureOptimisticFinanceSnapshot,
    removeTransactionAcrossCaches,
    restoreOptimisticFinanceSnapshot,
    upsertTransactionAcrossCaches,
} from '@/lib/optimistic-cache';
import { CurrencyDisplay, formatAmountAbbreviated } from '@/components/CurrencyDisplay';

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

type IncomingDebtPaymentSyncRow = {
    notificationId: string;
    paymentId: string;
    amount: number;
    currencyCode: string | null;
    paymentDate: string;
    note: string | null;
    proposerName: string;
    proposerDebtId: string;
    peerDebtId: string | null;
    peerDebtType: 'i_owe' | 'they_owe' | null;
};

export function SpendingPage() {
    const queryClient = useQueryClient();
    const { data: transactionsData, isLoading } = trpc.transaction.list.useQuery({ hideAdjustments: true }) as { data: { transactions: Transaction[] } | undefined, isLoading: boolean };
    const { data: incomingSplitRequests } = trpc.splitBill.listIncomingRequests.useQuery({ limit: 10 });
    const { data: pendingIncomingReceipts } = trpc.splitBill.listPendingIncomingReceipts.useQuery({ limit: 10 });
    const { data: incomingDebtRequests } = trpc.debt.listIncomingRequests.useQuery({ limit: 10 }, { refetchInterval: 5000 });
    const { data: incomingDebtPaymentSync } = trpc.debt.listIncomingDebtPaymentSync.useQuery({ limit: 10 }, { refetchInterval: 5000 });
    const { data: banks } = trpc.bank.getHierarchy.useQuery();
    const { data: categories } = trpc.category.list.useQuery();
    const utils = trpc.useUtils();

    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [isAddingPayback, setIsAddingPayback] = useState(false);
    const [paybackAmount, setPaybackAmount] = useState('');
    const [paybackDescription, setPaybackDescription] = useState('Payback');

    const deleteTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
    const deleteSnapshotsRef = useRef<Map<string, ReturnType<typeof captureOptimisticFinanceSnapshot>>>(new Map());
    const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

    const createTransaction = trpc.transaction.create.useMutation({
        onMutate: async (variables: any) => {
            await Promise.all([
                utils.transaction.list.cancel(),
                utils.account.getTotalBalance.cancel(),
                utils.bank.getHierarchy.cancel(),
            ]);

            const snapshot = captureOptimisticFinanceSnapshot(queryClient);
            const transactionId =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : `temp-${Date.now()}`;
            const optimisticTransaction = {
                id: transactionId,
                currencyBalanceId: variables.currencyBalanceId,
                amount: variables.amount,
                description: variables.description ?? paybackDescription,
                date: variables.date,
                type: variables.type,
                category: categories?.find((category: any) => category.id === variables.categoryId) ?? null,
                currencyBalance: banks
                    ?.flatMap((bank: any) =>
                        bank.accounts.flatMap((account: any) =>
                            account.currencyBalances
                                .filter((balance: any) => balance.id === variables.currencyBalanceId)
                                .map((balance: any) => ({
                                    currencyCode: balance.currencyCode,
                                    account: {
                                        id: account.id,
                                        name: account.name,
                                        bank: {
                                            name: bank.name,
                                        },
                                    },
                                })),
                        ),
                    )[0] ?? null,
            };

            upsertTransactionAcrossCaches(queryClient, optimisticTransaction);

            return { snapshot };
        },
        onSuccess: () => {
            setIsAddingPayback(false);
            setPaybackAmount('');
            setPaybackDescription('Payback');
        },
        onError: (error: any, _variables: any, context: any) => {
            restoreOptimisticFinanceSnapshot(queryClient, context?.snapshot);
            toast.error(error.message || 'Failed to add payback');
        },
        onSettled: () => {
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
        },
    });
    const [transactionSheetOpen, setTransactionSheetOpen] = useState(false);
    const [selectedShortcut, setSelectedShortcut] = useState<TransactionShortcut | null>(null);
    const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
    const [shortcutsListOpen, setShortcutsListOpen] = useState(false);
    const [editingShortcut, setEditingShortcut] = useState<TransactionShortcut | null>(null);
    const [shortcuts, setShortcuts] = useState<TransactionShortcut[]>([]);

    const favoriteShortcuts = useMemo(() => shortcuts.filter(s => s.isFavorite), [shortcuts]);

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
    const [respondingSplitId, setRespondingSplitId] = useState<string | null>(null);
    const [payNowRequest, setPayNowRequest] = useState<any | null>(null);
    const [payNowAmount, setPayNowAmount] = useState('');
    const [payNowPayerAccountId, setPayNowPayerAccountId] = useState('');
    const [payNowReceiverAccountId, setPayNowReceiverAccountId] = useState('__manual__');
    const [showOverpayConfirm, setShowOverpayConfirm] = useState(false);
    const [receiptAccountSelections, setReceiptAccountSelections] = useState<Record<string, string>>({});
    const [incomingDebtAccountSelections, setIncomingDebtAccountSelections] = useState<Record<string, string>>({});
    const [repaymentSyncAccountSelections, setRepaymentSyncAccountSelections] = useState<Record<string, string>>({});

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

    const respondToIncomingSplit = trpc.splitBill.respondToIncomingRequest.useMutation({
        onSuccess: (result: any) => {
            utils.splitBill.listIncomingRequests.invalidate();
            utils.splitBill.getPendingSplits.invalidate();
            utils.transaction.list.invalidate();
            utils.debt.list.invalidate();
            utils.notification.list.invalidate();
            if (result?.outcome === 'debt') {
                toast.success('Split approved as debt');
            } else if (result?.outcome === 'instant_payment') {
                toast.success('Split approved and settled');
            } else {
                toast.success('Split request declined');
            }
            setRespondingSplitId(null);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to process split request');
            setRespondingSplitId(null);
        }
    });

    const payIncomingNow = trpc.splitBill.payIncomingRequestNow.useMutation({
        onSuccess: (result: any) => {
            utils.splitBill.listIncomingRequests.invalidate();
            utils.splitBill.getPendingSplits.invalidate();
            utils.transaction.list.invalidate();
            utils.debt.list.invalidate();
            utils.account.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
            utils.notification.list.invalidate();
            if (result?.outcome === 'pay_now_partial_to_debt') {
                toast.success('Paid now. Remaining amount moved to debt.');
            } else {
                toast.success('Split paid successfully.');
            }
            setPayNowRequest(null);
            setPayNowAmount('');
            setPayNowPayerAccountId('');
            setPayNowReceiverAccountId('__manual__');
            setShowOverpayConfirm(false);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to process payment');
        }
    });

    const importIncomingCategory = trpc.splitBill.importIncomingSplitCategory.useMutation({
        onSuccess: () => {
            utils.splitBill.listIncomingRequests.invalidate();
            utils.category.list.invalidate();
            toast.success('Category added to your list');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to import category');
        }
    });

    const assignIncomingReceipt = trpc.splitBill.assignIncomingReceipt.useMutation({
        onSuccess: () => {
            utils.splitBill.listPendingIncomingReceipts.invalidate();
            utils.transaction.list.invalidate();
            utils.account.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
            utils.notification.list.invalidate();
            toast.success('Incoming payment assigned to account');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to assign incoming payment');
        }
    });

    const respondToIncomingDebtRequest = trpc.debt.respondToIncomingRequest.useMutation({
        onSuccess: () => {
            utils.debt.listIncomingRequests.invalidate();
            utils.debt.list.invalidate();
            utils.notification.list.invalidate();
            utils.transaction.list.invalidate();
            utils.account.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
            toast.success('Debt request processed');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to process debt request');
        },
    });

    const respondToDebtPaymentSync = trpc.debt.respondToDebtPaymentSync.useMutation({
        onSuccess: () => {
            utils.debt.listIncomingDebtPaymentSync.invalidate();
            utils.debt.list.invalidate();
            utils.notification.list.invalidate();
            utils.transaction.list.invalidate();
            utils.account.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
            toast.success('Repayment confirmed');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to respond');
        },
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

        if (updated && updated !== editingTransaction) {
            setEditingTransaction(updated);
        }
    }, [transactionsData, editingTransaction, setEditingTransaction]);

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

    const watchedCurrencyBalanceId = watchEdit('currencyBalanceId');

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

    const watchedShortcutIcon = watchShortcut('icon');
    const watchedShortcutType = watchShortcut('type');
    const watchedShortcutCurrencyBalanceId = watchShortcut('currencyBalanceId');

    const deleteTransaction = trpc.transaction.delete.useMutation({
        onSuccess: () => {
        },
        onError: (error: unknown, variables: any) => {
            restoreOptimisticFinanceSnapshot(queryClient, deleteSnapshotsRef.current.get(variables.id));
            deleteSnapshotsRef.current.delete(variables.id);
            toast.error('Failed to delete transaction');
            console.error(error);
        },
        onSettled: (_data: any, _error: any, variables: any) => {
            deleteSnapshotsRef.current.delete(variables.id);
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
        },
    });

    const updateTransaction = trpc.transaction.update.useMutation({
        onMutate: async (variables: any) => {
            await Promise.all([
                utils.transaction.list.cancel(),
                utils.account.getTotalBalance.cancel(),
                utils.bank.getHierarchy.cancel(),
            ]);

            const snapshot = captureOptimisticFinanceSnapshot(queryClient);
            const previousTransaction = transactionsData?.transactions
                ?.flatMap((transaction) => [transaction, ...(transaction.childTransactions ?? [])])
                .find((transaction) => transaction.id === variables.id);

            if (!previousTransaction) {
                return { snapshot };
            }

            const nextTransaction = {
                ...previousTransaction,
                ...variables,
                amount: variables.amount ?? previousTransaction.amount,
                date: variables.date ?? previousTransaction.date,
                description: variables.description ?? previousTransaction.description,
                category: categories?.find((category: any) => category.id === variables.categoryId)
                    ?? previousTransaction.category,
            };

            const previousDeltas = buildBalanceDeltasForTransaction(previousTransaction, currencyCodeById, -1);
            const nextDeltas = buildBalanceDeltasForTransaction(nextTransaction, currencyCodeById, 1);

            upsertTransactionAcrossCaches(queryClient, nextTransaction);
            applyBalanceDeltas(queryClient, [...previousDeltas, ...nextDeltas]);

            return { snapshot };
        },
        onSuccess: () => {
            setEditingTransaction(null);
            reset();
        },
        onError: (error: unknown, _variables: any, context: any) => {
            restoreOptimisticFinanceSnapshot(queryClient, context?.snapshot);
            toast.error('Failed to update transaction');
            console.error(error);
        },
        onSettled: () => {
            utils.transaction.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
        },
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
        const options: { id: string; label: string; currencyCode: string; balance: number }[] = [];
        banks.forEach((bank: any) => {
            bank.accounts?.forEach((acc: any) => {
                acc.currencyBalances?.forEach((cb: any) => {
                    options.push({
                        id: cb.id,
                        label: `${formatAccountLabel(bank.name, acc.name, acc.last4Digits)} - ${cb.currencyCode}`,
                        currencyCode: cb.currencyCode,
                        balance: Number(cb.balance),
                    });
                });
            });
        });
        return options;
    }, [banks]);


    const categoryLabelById = useMemo(() => {
        return new Map<string, string>((categories || []).map((cat: { id: string; name: string; icon: string }) => [cat.id, `${cat.icon} ${cat.name} `]));
    }, [categories]);

    const payNowRequestedAmount = Number(payNowAmount) || 0;
    const payNowOriginalRemaining = Number(payNowRequest?.remainingAmount || 0);
    const payNowRemainingAfter = Math.max(payNowOriginalRemaining - payNowRequestedAmount, 0);
    const isPayNowOverpay = payNowRequestedAmount > payNowOriginalRemaining && payNowOriginalRemaining > 0;
    const selectedPayNowAccount = currencyOptions.find((opt) => opt.id === payNowPayerAccountId);
    const isPayNowInsufficient = Boolean(selectedPayNowAccount && payNowRequestedAmount > selectedPayNowAccount.balance);

    const currencyCodeById = useMemo(() => {
        const map = new Map<string, string>();
        if (!banks) return map;
        banks.forEach((bank: { accounts: Array<{ currencyBalances: Array<{ id: string; currencyCode: string }> }> }) => {
            bank.accounts.forEach((acc) => {
                acc.currencyBalances.forEach((cb) => {
                    map.set(cb.id, cb.currencyCode);
                });
            });
        });
        return map;
    }, [banks]);

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

    const handleDelete = (transaction: Transaction) => {
        const label = transaction.description || transaction.category?.name || 'Transaction';
        const snapshot = captureOptimisticFinanceSnapshot(queryClient);
        setPendingDeletes(prev => new Set(prev).add(transaction.id));
        deleteSnapshotsRef.current.set(transaction.id, snapshot);
        removeTransactionAcrossCaches(queryClient, transaction.id);
        applyBalanceDeltas(
            queryClient,
            buildBalanceDeltasForTransaction(transaction, currencyCodeById, -1),
        );

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
                    restoreOptimisticFinanceSnapshot(queryClient, deleteSnapshotsRef.current.get(transaction.id));
                    deleteSnapshotsRef.current.delete(transaction.id);
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

    const [receiptTheme, setReceiptTheme] = useState<'light' | 'dark'>('light');
    const [viewMode, setViewMode] = useState<'week' | 'month'>('month');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [page, setPage] = useState(1);
    const [activeWeek, setActiveWeek] = useState<number>(1);
    const ITEMS_PER_PAGE = 15;

    const visibleTransactions = (transactionsData?.transactions || []).filter(t => !pendingDeletes.has(t.id));

    const { monthTransactions, weekTransactions, displayTransactions, paginatedTransactions, hasMore, monthTotal, weekTotal, weeksInMonthData, currentWeekNum } = useMemo(() => {
        const now = selectedDate;
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const getWeek = (d: Date) => {
            const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
            const dayOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0, Sun=6
            return Math.ceil((d.getDate() + dayOffset) / 7);
        };

        const currentWeekNum = getWeek(now);
        
        // Get start and end of week (Monday to Sunday)
        const d = new Date(now);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const startOfWeek = new Date(d.setDate(diff));
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const monthTxs = visibleTransactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
        });

        const weekTxs = monthTxs.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= startOfWeek && txDate <= endOfWeek;
        });

        const displayTxs = viewMode === 'week' ? weekTxs : monthTxs;
        const paginatedTxs = displayTxs.slice(0, page * ITEMS_PER_PAGE);
        const hasMoreTxs = paginatedTxs.length < displayTxs.length;

        const calcTotal = (txs: Transaction[]) => txs.reduce((acc, tx) => acc + (tx.type === 'expense' ? -Math.abs(Number(tx.amount)) : Math.abs(Number(tx.amount))), 0);

        const weeksMap = new Map<number, Transaction[]>();
        const lastDayOfMonthDate = new Date(currentYear, currentMonth + 1, 0);
        const totalWeeks = getWeek(lastDayOfMonthDate);
        
        for (let i = 1; i <= totalWeeks; i++) {
            weeksMap.set(i, []);
        }

        monthTxs.forEach(tx => {
            const w = getWeek(new Date(tx.date));
            if (weeksMap.has(w)) {
                weeksMap.get(w)!.push(tx);
            }
        });

        const weeksData = Array.from(weeksMap.entries())
            .map(([weekNum, txs]) => {
                const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
                const firstDayOffset = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1;
                
                const startDay = (weekNum - 1) * 7 - firstDayOffset + 1;
                const startDate = new Date(currentYear, currentMonth, startDay);
                const endDate = new Date(currentYear, currentMonth, startDay + 6);
                
                // Clamp to month boundaries
                const finalStart = startDate < firstDayOfMonth ? firstDayOfMonth : startDate;
                const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
                const finalEnd = endDate > lastDayOfMonth ? lastDayOfMonth : endDate;

                const dateRange = `${finalStart.getDate()}-${finalEnd.getDate()} ${finalStart.toLocaleString('default', { month: 'short' })}`;

                return {
                    weekNum,
                    startDate: finalStart,
                    dateRange,
                    transactions: txs,
                    total: calcTotal(txs)
                };
            })
            .filter(w => {
                const today = new Date();
                // If it's current month, don't show future weeks. If it's past month, show all weeks.
                if (currentYear < today.getFullYear() || (currentYear === today.getFullYear() && currentMonth < today.getMonth())) {
                    return true;
                }
                return w.startDate <= today;
            })
            .sort((a, b) => b.weekNum - a.weekNum);

        return {
            monthTransactions: monthTxs,
            weekTransactions: weekTxs,
            displayTransactions: displayTxs,
            paginatedTransactions: paginatedTxs,
            hasMore: hasMoreTxs,
            monthTotal: calcTotal(monthTxs),
            weekTotal: calcTotal(weekTxs),
            weeksInMonthData: weeksData,
            currentWeekNum
        };
    }, [visibleTransactions, viewMode, page, selectedDate]);

    useEffect(() => {
        if (currentWeekNum && activeWeek === 1) {
            setActiveWeek(currentWeekNum);
        }
    }, [currentWeekNum]);

    const renderReceipt = (
        txs: Transaction[], 
        title: string, 
        total: number, 
        weekNum?: number, 
        isActive: boolean = true, 
        offsetIndex: number = 0, 
        onClick?: () => void,
        showPagination: boolean = false,
        dateRange?: string
    ) => {
        const receiptDate = isActive && !weekNum ? selectedDate : (txs.length > 0 ? new Date(txs[0].date) : selectedDate);
        return (
            <div 
                key={weekNum || 'single'}
                className={cn(
                    "relative w-full max-w-[448px] font-mono text-sm sm:text-base pb-8 pt-6 px-6 sm:px-8 transition-all duration-500",
                    receiptTheme === 'light' ? "bg-[#fdfdfd] text-[#1a1a1a]" : "bg-[#1a1a1a] text-[#fdfdfd]",
                    !isActive && "cursor-pointer hover:shadow-[0_12px_32px_rgba(0,0,0,0.15)] opacity-95",
                    isActive && "shadow-[0_-8px_30px_rgba(0,0,0,0.08),0_8px_30px_rgba(0,0,0,0.12)]"
                )}
                style={{
                    margin: '16px 0'
                }}
                onClick={onClick}
            >
                {/* Active week label */}
                {weekNum !== undefined && isActive && (
                    <div className={cn(
                        "absolute top-4 right-4 font-bold text-lg opacity-80 pointer-events-none z-10",
                        receiptTheme === 'light' ? "text-[#dc2626]" : "text-[#f87171]"
                    )} style={{ fontFamily: '"Comic Sans MS", marker, sans-serif' }}>
                        WEEK {weekNum}
                        {dateRange && <span className="block text-[10px] text-right -mt-1 font-mono">{dateRange}</span>}
                    </div>
                )}

                {/* Inline Controls (only on active/main receipt) */}
                {isActive && (
                    <div className="flex flex-wrap items-center justify-start gap-2 mb-6 -mt-2">
                        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 scale-90 origin-left">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const prev = new Date(selectedDate);
                                    prev.setMonth(prev.getMonth() - 1);
                                    setSelectedDate(prev);
                                    setPage(1);
                                    if (viewMode === 'week') setActiveWeek(1);
                                }}
                            >
                                <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                            </Button>
                            <span className="text-[10px] font-bold px-1 min-w-[60px] text-center uppercase">
                                {selectedDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={selectedDate.getMonth() === new Date().getMonth() && selectedDate.getFullYear() === new Date().getFullYear()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const next = new Date(selectedDate);
                                    next.setMonth(next.getMonth() + 1);
                                    setSelectedDate(next);
                                    setPage(1);
                                    if (viewMode === 'week') setActiveWeek(1);
                                }}
                            >
                                <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                            </Button>
                        </div>

                        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 scale-90 origin-left">
                            <Button
                                variant={viewMode === 'week' ? 'secondary' : 'ghost'}
                                size="sm"
                                className={cn(
                                    "h-6 px-2 text-[10px] font-bold uppercase",
                                    viewMode === 'week' && "bg-background shadow-sm hover:bg-background"
                                )}
                                onClick={(e) => { e.stopPropagation(); setViewMode('week'); setPage(1); }}
                            >
                                Week
                            </Button>
                            <Button
                                variant={viewMode === 'month' ? 'secondary' : 'ghost'}
                                size="sm"
                                className={cn(
                                    "h-6 px-2 text-[10px] font-bold uppercase",
                                    viewMode === 'month' && "bg-background shadow-sm hover:bg-background"
                                )}
                                onClick={(e) => { e.stopPropagation(); setViewMode('month'); setPage(1); }}
                            >
                                Month
                            </Button>
                        </div>

                        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 scale-90 origin-left">
                            <Button
                                variant={receiptTheme === 'light' ? 'secondary' : 'ghost'}
                                size="sm"
                                className={cn(
                                    "h-6 px-2 text-[10px] font-bold uppercase",
                                    receiptTheme === 'light' && "bg-background shadow-sm hover:bg-background"
                                )}
                                onClick={(e) => { e.stopPropagation(); setReceiptTheme('light'); }}
                            >
                                Light
                            </Button>
                            <Button
                                variant={receiptTheme === 'dark' ? 'secondary' : 'ghost'}
                                size="sm"
                                className={cn(
                                    "h-6 px-2 text-[10px] font-bold uppercase",
                                    receiptTheme === 'dark' && "bg-background shadow-sm hover:bg-background"
                                )}
                                onClick={(e) => { e.stopPropagation(); setReceiptTheme('dark'); }}
                            >
                                Dark
                            </Button>
                        </div>
                    </div>
                )}

                {/* Top zigzag */}
                <div className="absolute top-[-8px] left-0 w-full h-[8px] bg-repeat-x" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='16' height='8' viewBox='0 0 16 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 8L4 0L8 8L12 0L16 8H0Z' fill='${receiptTheme === 'light' ? '%23fdfdfd' : '%231a1a1a'}'/%3E%3C/svg%3E")`
                }}></div>
                
                {/* Receipt Header */}
                <div className="text-center mb-6 flex flex-col items-center">
                    <h2 className="text-2xl font-bold uppercase tracking-widest mb-1">Woolet</h2>
                    <p className="text-xs uppercase tracking-wider mb-2">{title}</p>
                    <p className="text-xs">{receiptDate.toLocaleDateString()} {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>

                <div className={cn(
                    "border-b-2 border-dashed mb-4",
                    receiptTheme === 'light' ? "border-[#1a1a1a]/30" : "border-[#fdfdfd]/30"
                )}></div>

                {/* Table Header */}
                <div className="flex justify-between font-bold mb-2 text-xs sm:text-sm uppercase">
                    <span className="w-8">QTY</span>
                    <span className="flex-1">DESCRIPTION</span>
                    <span className="text-right w-24">COST</span>
                </div>

                {/* Transactions List */}
                {isLoading ? (
                    <p className="text-center py-8 text-xs">PRINTING...</p>
                ) : txs.length === 0 ? (
                    <p className="text-center py-8 text-xs">NO TRANSACTIONS YET</p>
                ) : (
                    <div className="space-y-4">
                        {txs.map((tx: Transaction) => (
                            <div key={tx.id} className="group relative">
                                <div className="flex justify-between items-start text-xs sm:text-sm">
                                    <span className="w-8 pt-0.5">1</span>
                                    <div className="flex-1 pr-2">
                                        <p className="uppercase break-words font-semibold">{tx.description || tx.category?.name || 'UNKNOWN'}</p>
                                        <p className={cn(
                                            "text-[10px] mt-0.5 uppercase",
                                            receiptTheme === 'light' ? "text-[#1a1a1a]/70" : "text-[#fdfdfd]/70"
                                        )}>
                                            {tx.category?.icon} {tx.currencyBalance?.account?.name || 'Account'}
                                        </p>
                                        <p className={cn(
                                            "text-[10px] font-mono",
                                            receiptTheme === 'light' ? "text-[#1a1a1a]/70" : "text-[#fdfdfd]/70"
                                        )}>
                                            #{tx.id.slice(0, 8).toUpperCase()}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-right w-24 pt-0.5">
                                            <CurrencyDisplay
                                                amount={tx.type === 'expense' ? -Math.abs(Number(tx.amount)) : Math.abs(Number(tx.amount))}
                                                currency={tx.currencyBalance?.currencyCode}
                                                showSign
                                                color={tx.type === 'income'
                                                    ? (receiptTheme === 'light' ? '#059669' : '#34d399')
                                                    : (receiptTheme === 'light' ? '#dc2626' : '#f87171')}
                                                className="whitespace-nowrap font-bold text-sm sm:text-base"
                                            />
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className={cn(
                                                    "h-6 w-6",
                                                    receiptTheme === 'light' ? "text-[#1a1a1a]" : "text-[#fdfdfd]"
                                                )}>
                                                    <MoreHorizontal className="h-3 w-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEdit(tx)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleDelete(tx)}
                                                    className="text-red-500"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                                
                                {/* Split Bill Details */}
                                {tx.type === 'expense' && tx.splits && tx.splits.length > 0 && (
                                    <div className={cn(
                                        "ml-8 mt-2 pl-2 border-l border-dashed",
                                        receiptTheme === 'light' ? "border-[#1a1a1a]/30" : "border-[#fdfdfd]/30"
                                    )}>
                                        <button
                                            onClick={() => toggleSplitExpand(tx.id)}
                                            className={cn(
                                                "flex items-center gap-1 text-[10px] uppercase tracking-wider px-1 py-0.5 rounded transition-colors",
                                                receiptTheme === 'light' ? "hover:bg-black/5" : "hover:bg-white/5"
                                            )}
                                        >
                                            {expandedSplits.has(tx.id) ? '[-] ' : '[+] '}
                                            SPLIT WITH {tx.splits.length}
                                        </button>
                                        {expandedSplits.has(tx.id) && (
                                            <div className="mt-1 space-y-1">
                                                {tx.splits.map((split: TransactionSplit) => {
                                                    const owed = Number(split.owedAmount);
                                                    const paid = Number(split.paidAmount);
                                                    const remaining = owed - paid;
                                                    return (
                                                        <div key={split.id} className="flex justify-between items-center text-[10px]">
                                                            <span className="uppercase truncate max-w-[100px]">- {split.participant?.name || 'UNKNOWN'}</span>
                                                            <div className="flex items-center gap-2">
                                                                {split.status === 'settled' ? (
                                                                    <span className={cn(
                                                                        "font-bold",
                                                                        receiptTheme === 'light' ? "text-[#059669]" : "text-[#34d399]"
                                                                    )}>PAID</span>
                                                                ) : (
                                                                    <>
                                                                        <span className="font-bold">
                                                                            OWES <CurrencyDisplay amount={remaining} currency={tx.currencyBalance?.currencyCode} color={receiptTheme === 'light' ? '#dc2626' : '#f87171'} />
                                                                        </span>
                                                                        <button
                                                                            className={cn(
                                                                                "underline decoration-dashed",
                                                                                receiptTheme === 'light' ? "hover:text-blue-600" : "hover:text-blue-400"
                                                                            )}
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
                                                                            PAY
                                                                        </button>
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

                <div className={cn(
                    "border-t-2 border-dashed mt-6 pt-4 space-y-2",
                    receiptTheme === 'light' ? "border-[#1a1a1a]/30" : "border-[#fdfdfd]/30"
                )}>
                    {!weekNum && viewMode === 'week' && (
                        <div className="flex justify-between font-bold text-sm uppercase opacity-70">
                            <span>Weekly Sub-total</span>
                            <span>
                                <CurrencyDisplay
                                    amount={weekTotal}
                                    currency={txs[0]?.currencyBalance?.currencyCode || 'USD'}
                                    color={receiptTheme === 'light' ? '#1a1a1a' : '#fdfdfd'}
                                />
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-base sm:text-lg uppercase">
                        <span>{(!weekNum && viewMode === 'week') ? 'Month-to-Date' : 'Order Total'}</span>
                        <span>
                            <CurrencyDisplay
                                amount={!weekNum && viewMode === 'week' ? monthTotal : total}
                                currency={txs[0]?.currencyBalance?.currencyCode || 'USD'}
                                color={receiptTheme === 'light' ? '#1a1a1a' : '#fdfdfd'}
                            />
                        </span>
                    </div>
                </div>

                <div className="mt-8 text-center space-y-2">
                    <p className="text-xs uppercase tracking-widest">*** THANK YOU! ***</p>
                    <div className="flex justify-center mt-4">
                        {/* Fake barcode */}
                        <div className="flex gap-[2px] h-12 items-end">
                            {[...Array(40)].map((_, i) => (
                                <div key={i} className={receiptTheme === 'light' ? "bg-[#1a1a1a]" : "bg-[#fdfdfd]"} style={{ 
                                    width: `${Math.random() > 0.5 ? 2 : 4}px`, 
                                    height: `${Math.random() > 0.8 ? 80 : 100}%` 
                                }}></div>
                            ))}
                        </div>
                    </div>
                    <p className="text-[10px] mt-1 tracking-widest">{Date.now().toString().slice(-12)}</p>
                </div>

                {showPagination && hasMore && (
                    <div className="mt-8 -mx-6 sm:-mx-8">
                        <div className={cn(
                            "border-t-2 border-dashed relative flex justify-center",
                            receiptTheme === 'light' ? "border-[#1a1a1a]/30" : "border-[#fdfdfd]/30"
                        )}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setPage(p => p + 1); }}
                                className={cn(
                                    "absolute -top-3 px-4 text-[10px] font-bold tracking-widest uppercase hover:underline transition-all",
                                    receiptTheme === 'light' ? "bg-[#fdfdfd] text-[#1a1a1a]" : "bg-[#1a1a1a] text-[#fdfdfd]"
                                )}
                            >
                                ▼ TEAR HERE FOR MORE (PART {page}/{Math.ceil(displayTransactions.length / ITEMS_PER_PAGE)}) ▼
                            </button>
                        </div>
                    </div>
                )}

                {/* Bottom zigzag */}
                <div className="absolute bottom-[-8px] left-0 w-full h-[8px] bg-repeat-x" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='16' height='8' viewBox='0 0 16 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0L4 8L8 0L12 8L16 0H0Z' fill='${receiptTheme === 'light' ? '%23fdfdfd' : '%231a1a1a'}'/%3E%3C/svg%3E")`
                }}></div>
            </div>
        );
    };

    return (
        <div className={cn("flex flex-col min-h-[calc(100vh-100px)] w-full", favoritesWidgetVisible ? "pb-32" : "pb-12")}>
            <PageHeader
                className="w-full px-4"
                    title="Spending"
                    subtitle="Track your daily expenses"
                    variant="two-mixed"
                >
                <div className="flex items-center gap-2">
                    {/* Shortcuts button - icon-only on mobile */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShortcutsListOpen(true)}
                        title="Shortcuts"
                        className="px-2 md:px-3 h-8 md:h-9"
                    >
                        <Bookmark className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Shortcuts</span>
                    </Button>
                </div>
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
                            <Button size="sm" className="gap-2 h-8 md:h-9" onClick={() => setSelectedShortcut(null)}>
                                <Plus className="h-4 w-4" />
                                <span className="hidden md:inline">Add Transaction</span>
                                <span className="md:hidden">Add</span>
                            </Button>
                        )}
                    />
            </PageHeader>

            <div className="w-full max-w-5xl mx-auto px-4 flex flex-col items-center">
            {incomingSplitRequests && incomingSplitRequests.length > 0 && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-3 sm:p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-primary" />
                            <p className="text-sm font-semibold">
                                Split Requests ({incomingSplitRequests.length})
                            </p>
                        </div>
                        <div className="space-y-2">
                            {incomingSplitRequests.map((request: any) => (
                                <div key={request.id} className="rounded-lg border bg-background p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {request.fromUser?.name || request.fromUser?.username || request.participant?.name || 'Friend'}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {request.transaction?.description || 'Split bill request'}
                                            </p>
                                        </div>
                                        <CurrencyDisplay
                                            amount={Number(request.remainingAmount || 0)}
                                            currency={request.transaction?.currencyBalance?.currencyCode}
                                            className="text-sm font-semibold"
                                        />
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={respondToIncomingSplit.isPending && respondingSplitId === request.id}
                                            onClick={() => {
                                                setRespondingSplitId(request.id);
                                                respondToIncomingSplit.mutate({
                                                    splitId: request.id,
                                                    decision: 'approve',
                                                    settlement: 'debt',
                                                });
                                            }}
                                        >
                                            Approve as Debt
                                        </Button>
                                        <Button
                                            size="sm"
                                            disabled={respondToIncomingSplit.isPending && respondingSplitId === request.id}
                                            onClick={() => {
                                                const matchingPayer = currencyOptions.find(
                                                    (opt) => opt.currencyCode === request.transaction?.currencyBalance?.currencyCode
                                                );
                                                setPayNowRequest(request);
                                                setPayNowAmount(String(Number(request.remainingAmount || 0)));
                                                setPayNowPayerAccountId(matchingPayer?.id || '');
                                                setPayNowReceiverAccountId('__manual__');
                                            }}
                                        >
                                            Pay now
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive hover:text-destructive"
                                            disabled={respondToIncomingSplit.isPending && respondingSplitId === request.id}
                                            onClick={() => {
                                                setRespondingSplitId(request.id);
                                                respondToIncomingSplit.mutate({
                                                    splitId: request.id,
                                                    decision: 'decline',
                                                });
                                            }}
                                        >
                                            Decline
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {pendingIncomingReceipts && pendingIncomingReceipts.length > 0 && (
                <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardContent className="p-3 sm:p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                            <p className="text-sm font-semibold">
                                Incoming Payments To Assign ({pendingIncomingReceipts.length})
                            </p>
                        </div>
                        <div className="space-y-2">
                            {pendingIncomingReceipts.map((receipt: any) => {
                                const receiptAccountId = receiptAccountSelections[receipt.paymentId];
                                const receiptSelectedOpt = receiptAccountId
                                    ? currencyOptions.find((o) => o.id === receiptAccountId)
                                    : undefined;
                                return (
                                <div key={receipt.paymentId} className="rounded-lg border bg-background p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                From {receipt.fromUser?.name || receipt.fromUser?.username || 'Friend'}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {receipt.transactionDescription || 'Split payment'}
                                            </p>
                                        </div>
                                        <CurrencyDisplay
                                            amount={Number(receipt.amount || 0)}
                                            currency={receipt.currencyCode}
                                            className="text-sm font-semibold text-emerald-600"
                                        />
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-end gap-2">
                                        <div className="min-w-[260px] flex-1 space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label className="text-xs text-muted-foreground">Receive to account</Label>
                                                {receiptSelectedOpt && (
                                                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted/50 border shrink-0">
                                                        Balance: {receiptSelectedOpt.balance.toLocaleString()} {receiptSelectedOpt.currencyCode}
                                                    </span>
                                                )}
                                            </div>
                                            <Select
                                                value={receiptAccountSelections[receipt.paymentId]}
                                                onValueChange={(val) => {
                                                    setReceiptAccountSelections((prev) => ({
                                                        ...prev,
                                                        [receipt.paymentId]: val,
                                                    }));
                                                }}
                                            >
                                                <SelectTrigger className="min-h-14">
                                                    <SelectValue placeholder="Select account" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {currencyOptions
                                                        .filter((opt) => opt.currencyCode === receipt.currencyCode)
                                                        .map((opt) => (
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
                                        <Button
                                            size="sm"
                                            disabled={!receiptAccountSelections[receipt.paymentId] || assignIncomingReceipt.isPending}
                                            onClick={() => {
                                                const currencyBalanceId = receiptAccountSelections[receipt.paymentId];
                                                if (!currencyBalanceId) return;
                                                assignIncomingReceipt.mutate({
                                                    paymentId: receipt.paymentId,
                                                    currencyBalanceId,
                                                });
                                            }}
                                        >
                                            Assign
                                        </Button>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {incomingDebtRequests && incomingDebtRequests.length > 0 && (
                <Card className="border-violet-500/20 bg-violet-500/5">
                    <CardContent className="p-3 sm:p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-violet-600" />
                            <p className="text-sm font-semibold">
                                Debt Requests ({incomingDebtRequests.length})
                            </p>
                        </div>
                        <div className="space-y-2">
                            {incomingDebtRequests.map((request: any) => {
                                const selectedAccountId = incomingDebtAccountSelections[request.notificationId];
                                const selectedAccount = currencyOptions.find((opt) => opt.id === selectedAccountId);
                                const isFundingRequest = request.debtType === 'i_owe';
                                const isInsufficient = Boolean(
                                    isFundingRequest &&
                                    selectedAccount &&
                                    Number(request.amount || 0) > selectedAccount.balance
                                );

                                return (
                                    <div key={request.notificationId} className="rounded-lg border bg-background p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {request.requesterName || 'Friend'}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {isFundingRequest ? 'Borrow request (pay from your card)' : 'Incoming debt transfer (choose receive card)'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <CurrencyDisplay
                                                    amount={Number(request.amount || 0)}
                                                    currency={request.currencyCode}
                                                    className="text-sm font-semibold"
                                                />

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className={cn(
                                                            "h-6 w-6",
                                                            receiptTheme === 'light' ? "text-[#1a1a1a]" : "text-[#fdfdfd]"
                                                        )}>
                                                            <MoreHorizontal className="h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                respondToIncomingDebtRequest.mutate({
                                                                    notificationId: request.notificationId,
                                                                    decision: 'approve',
                                                                    currencyBalanceId: selectedAccountId,
                                                                });
                                                            }}
                                                            disabled={!selectedAccountId || isInsufficient || respondToIncomingDebtRequest.isPending}
                                                        >
                                                            <Check className="h-4 w-4 mr-2" />
                                                            Approve
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                respondToIncomingDebtRequest.mutate({
                                                                    notificationId: request.notificationId,
                                                                    decision: 'decline',
                                                                });
                                                            }}
                                                            disabled={respondToIncomingDebtRequest.isPending}
                                                            className="text-red-500"
                                                        >
                                                            <XCircle className="h-4 w-4 mr-2" />
                                                            Decline
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                    {isFundingRequest ? 'Pay from' : 'Receive to'}
                                                </Label>
                                                {selectedAccount && (
                                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted/50 border shrink-0">
                                                        Balance: {selectedAccount.balance.toLocaleString()} {selectedAccount.currencyCode}
                                                    </span>
                                                )}
                                            </div>
                                            <Select
                                                value={selectedAccountId}
                                                onValueChange={(val) => {
                                                    setIncomingDebtAccountSelections((prev) => ({
                                                        ...prev,
                                                        [request.notificationId]: val,
                                                    }));
                                                }}
                                            >
                                                <SelectTrigger className="min-h-14 text-xs">
                                                    <SelectValue placeholder="Select account" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {currencyOptions
                                                        .filter((opt) => opt.currencyCode === request.currencyCode)
                                                        .map((opt) => (
                                                            <SelectItem key={opt.id} value={opt.id} className="text-xs">
                                                                <div className="flex flex-col items-start py-1">
                                                                    <span className="font-medium text-sm">{opt.label}</span>
                                                                    <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                            {isInsufficient && (
                                                <p className="text-[10px] text-destructive flex items-center gap-1 font-medium">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Insufficient balance
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        )}

            {incomingDebtPaymentSync && incomingDebtPaymentSync.length > 0 && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="p-3 sm:p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <ArrowLeftRight className="h-4 w-4 text-amber-600" />
                            <p className="text-sm font-semibold">
                                Confirm linked repayments ({incomingDebtPaymentSync.length})
                            </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Someone recorded a repayment on a shared debt. Choose the account for your side, then approve.
                        </p>
                        <div className="space-y-2">
                            {incomingDebtPaymentSync.map((item: IncomingDebtPaymentSyncRow) => {
                                const selectedAccountId = repaymentSyncAccountSelections[item.notificationId];
                                const selectedAccount = currencyOptions.find((opt) => opt.id === selectedAccountId);
                                const isPayFrom = item.peerDebtType === 'i_owe';
                                const isInsufficient = Boolean(
                                    isPayFrom &&
                                    selectedAccount &&
                                    Number(item.amount || 0) > selectedAccount.balance
                                );

                                return (
                                    <div key={item.notificationId} className="rounded-lg border bg-background p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {item.proposerName}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    Recorded repayment · {item.paymentDate}
                                                </p>
                                            </div>
                                            <CurrencyDisplay
                                                amount={Number(item.amount || 0)}
                                                currency={item.currencyCode ?? undefined}
                                                className="text-sm font-semibold"
                                            />
                                        </div>
                                        {item.note ? (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.note}</p>
                                        ) : null}
                                        <div className="mt-3 space-y-2">
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                        {isPayFrom ? 'Pay from' : 'Receive to'}
                                                    </Label>
                                                    {selectedAccount && (
                                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted/50 border shrink-0">
                                                            Balance: {selectedAccount.balance.toLocaleString()} {selectedAccount.currencyCode}
                                                        </span>
                                                    )}
                                                </div>
                                                <Select
                                                    value={selectedAccountId}
                                                    onValueChange={(val) => {
                                                        setRepaymentSyncAccountSelections((prev) => ({
                                                            ...prev,
                                                            [item.notificationId]: val,
                                                        }));
                                                    }}
                                                >
                                                    <SelectTrigger className="min-h-14 text-xs">
                                                        <SelectValue placeholder="Select account" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {currencyOptions
                                                            .filter((opt) => opt.currencyCode === item.currencyCode)
                                                            .map((opt) => (
                                                                <SelectItem key={opt.id} value={opt.id} className="text-xs">
                                                                    <div className="flex flex-col items-start py-1">
                                                                        <span className="font-medium text-sm">{opt.label}</span>
                                                                        <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {isInsufficient && (
                                                <p className="text-[10px] text-destructive flex items-center gap-1 font-medium">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Insufficient balance
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    className="text-xs h-8"
                                                    disabled={
                                                        !selectedAccountId ||
                                                        isInsufficient ||
                                                        respondToDebtPaymentSync.isPending
                                                    }
                                                    onClick={() => {
                                                        if (!selectedAccountId) return;
                                                        respondToDebtPaymentSync.mutate({
                                                            notificationId: item.notificationId,
                                                            decision: 'approve',
                                                            currencyBalanceId: selectedAccountId,
                                                        });
                                                    }}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-xs h-8 text-destructive hover:text-destructive"
                                                    disabled={respondToDebtPaymentSync.isPending}
                                                    onClick={() => {
                                                        respondToDebtPaymentSync.mutate({
                                                            notificationId: item.notificationId,
                                                            decision: 'decline',
                                                        });
                                                    }}
                                                >
                                                    Decline
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

        <div className="flex flex-col items-center gap-12 mt-12 mb-24">
            {viewMode === 'month' ? (
                renderReceipt(
                    paginatedTransactions,
                    `${selectedDate.toLocaleString('default', { month: 'long' })} Spending`,
                    monthTotal,
                    undefined,
                    true,
                    0,
                    undefined,
                    true
                )
            ) : (
                <div className="flex flex-col items-center gap-12 w-full">
                    {weeksInMonthData.map((week, idx) => {
                        const isActive = activeWeek === week.weekNum;
                        return renderReceipt(
                            week.transactions,
                            `Week ${week.weekNum} Spending`,
                            week.total,
                            week.weekNum,
                            isActive,
                            idx,
                            () => setActiveWeek(week.weekNum),
                            false,
                            week.dateRange
                        );
                    })}
                </div>
            )}
        </div>
    </div>

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
                                value={watchedCurrencyBalanceId}
                            >
                                <SelectTrigger className="min-h-14">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencyOptions.map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            <div className="flex flex-col items-start py-1">
                                                <span className="font-medium text-sm">{opt.label}</span>
                                                <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                            </div>
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
                                                <CurrencyDisplay
                                                    amount={child.amount}
                                                    currency={child.currencyBalance?.currencyCode}
                                                    showSign
                                                    className="text-sm font-semibold text-green-600"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-destructive"
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
                                    <CurrencyDisplay
                                        amount={Number(watchEdit('amount')) - (editingTransaction.childTransactions || []).reduce((sum, t) => sum + Number(t.amount), 0)}
                                        currency={editingTransaction?.currencyBalance?.currencyCode || 'USD'}
                                        className="text-lg font-bold text-primary"
                                    />
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

            {/* Incoming Split Pay Now Sheet */}
            <Sheet open={!!payNowRequest} onOpenChange={(open) => {
                if (!open) {
                    setPayNowRequest(null);
                    setShowOverpayConfirm(false);
                }
            }}>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Pay Split Now</SheetTitle>
                        <SheetDescription>
                            Pay part now. Remaining amount will be moved to debt.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label>Amount ({payNowRequest?.transaction?.currencyBalance?.currencyCode})</Label>
                            <Input
                                type="number"
                                value={payNowAmount}
                                onChange={(e) => setPayNowAmount(e.target.value)}
                                placeholder={`Remaining: ${payNowRequest?.remainingAmount || ''}`}
                            />
                            {payNowRemainingAfter > 0 && (
                                <div className="text-xs text-muted-foreground">
                                    Remaining after payment: <CurrencyDisplay amount={payNowRemainingAfter} currency={payNowRequest?.transaction?.currencyBalance?.currencyCode} />
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Paid from your account</Label>
                            <Select value={payNowPayerAccountId} onValueChange={setPayNowPayerAccountId}>
                                <SelectTrigger className="min-h-14">
                                    <SelectValue placeholder="Select your account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencyOptions
                                        .filter((opt) => opt.currencyCode === payNowRequest?.transaction?.currencyBalance?.currencyCode)
                                        .map((opt) => (
                                            <SelectItem key={opt.id} value={opt.id}>
                                                <div className="flex flex-col items-start py-1">
                                                    <span className="font-medium text-sm">{opt.label}</span>
                                                    <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            {selectedPayNowAccount && (
                                <div className="text-xs text-muted-foreground">
                                    Balance: <CurrencyDisplay amount={selectedPayNowAccount.balance} currency={selectedPayNowAccount.currencyCode} />
                                </div>
                            )}
                        {isPayNowInsufficient && (
                            <p className="text-xs text-red-500">Insufficient funds in selected account.</p>
                        )}
                        </div>
                        <div className="space-y-2">
                            <Label>Receiver account (optional)</Label>
                            <Select
                                value={payNowReceiverAccountId}
                                onValueChange={setPayNowReceiverAccountId}
                                disabled={payNowRequest?.receivingAccountSharingEnabled === false}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={payNowRequest?.receivingAccountSharingEnabled === false ? 'Receiver disabled account sharing' : 'Select receiver account'} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__manual__">Manual receive (owner chooses later)</SelectItem>
                                    {(payNowRequest?.receivingAccounts || []).map((opt: any) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            {opt.label} ({opt.currencyCode})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {payNowRequest?.sourceCategory && (
                            <div className="rounded-md border p-2">
                                <div className="text-xs text-muted-foreground">
                                    Source category: <span className="font-medium text-foreground">{payNowRequest.sourceCategory.name}</span>
                                </div>
                                {!payNowRequest?.hasCategoryInMyList && (
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                        <p className="text-xs text-amber-600">You don&apos;t have this category. This payment will use Unknown.</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={importIncomingCategory.isPending}
                                            onClick={() => {
                                                if (!payNowRequest?.id) return;
                                                importIncomingCategory.mutate({ splitId: payNowRequest.id });
                                            }}
                                        >
                                            Bring Category
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                        {payNowRequest?.receivingAccountSharingEnabled === false && (
                            <p className="text-xs text-muted-foreground">
                                Receiver has hidden account sharing, so they will assign receiving account manually.
                            </p>
                        )}
                        <Button
                            className="w-full"
                            disabled={!payNowAmount || !payNowPayerAccountId || payIncomingNow.isPending || isPayNowInsufficient}
                            onClick={() => {
                                if (!payNowRequest || !payNowAmount || !payNowPayerAccountId) return;
                                if (isPayNowOverpay) {
                                    setShowOverpayConfirm(true);
                                    return;
                                }
                                payIncomingNow.mutate({
                                    splitId: payNowRequest.id,
                                    amountNow: Number(payNowAmount),
                                    payerCurrencyBalanceId: payNowPayerAccountId,
                                    receiverCurrencyBalanceId: payNowReceiverAccountId !== '__manual__' ? payNowReceiverAccountId : undefined,
                                });
                            }}
                        >
                            {payIncomingNow.isPending ? 'Processing...' : 'Pay now'}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

            <AlertDialog open={showOverpayConfirm} onOpenChange={setShowOverpayConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Amount Is Higher Than Needed</AlertDialogTitle>
                        <AlertDialogDescription>
                            You entered more than the remaining split amount. Continue and pay only the remaining amount?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!payNowRequest || !payNowPayerAccountId) return;
                                payIncomingNow.mutate({
                                    splitId: payNowRequest.id,
                                    amountNow: payNowOriginalRemaining,
                                    payerCurrencyBalanceId: payNowPayerAccountId,
                                    receiverCurrencyBalanceId: payNowReceiverAccountId !== '__manual__' ? payNowReceiverAccountId : undefined,
                                });
                            }}
                        >
                            Pay Remaining Amount
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                                {['💰', '🚌', '🍔', '☕', '🛒', '💳', '🏠', '⚡', '📱', '🎮', '✈️', '🎬', '💊', '📚', '🎁', '🚗'].map((emoji) => {
                                    const isSelected = watchedShortcutIcon === emoji;
                                    return (
                                        <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => setShortcutValue('icon', emoji)}
                                            className={`h-10 w-10 rounded-md flex items-center justify-center text-lg border-2 transition-colors ${isSelected
                                                ? 'border-primary bg-primary/10'
                                                : 'border-muted hover:border-muted-foreground/50'
                                                } `}
                                        >
                                            {emoji}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select
                                onValueChange={(val) => setShortcutValue('type', val as ShortcutForm['type'])}
                                value={watchedShortcutType}
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
                            <Select onValueChange={(val) => setShortcutValue('currencyBalanceId', val)} value={watchedShortcutCurrencyBalanceId}>
                                <SelectTrigger className="min-h-14">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencyOptions.map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            <div className="flex flex-col items-start py-1">
                                                <span className="font-medium text-sm">{opt.label}</span>
                                                <span className="text-xs text-muted-foreground">{opt.currencyCode} • {opt.balance.toLocaleString()}</span>
                                            </div>
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
                                    {categories?.map((cat: { id: string; name: string; icon: string }) => (
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
                                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 group ${selectedShortcut?.id === shortcut.id && transactionSheetOpen
                                        ? 'bg-primary/5 border-primary/50 shadow-md translate-x-1'
                                        : 'bg-card hover:bg-muted/30 border-border hover:border-border-foreground/10'
                                        }`}
                                >
                                    <button
                                        onClick={() => {
                                            openShortcut(shortcut);
                                            setShortcutsListOpen(false);
                                        }}
                                        className={`h-12 w-12 rounded-2xl flex items-center justify-center text-xl shrink-0 transition-all duration-300 border-2 ${shortcut.type === 'income' ? 'border-green-500/20' :
                                            shortcut.type === 'expense' ? 'border-red-500/20' :
                                                'border-blue-500/20'
                                            }`}
                                        style={{
                                            background: shortcut.type === 'income'
                                                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.02))'
                                                : shortcut.type === 'expense'
                                                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.02))'
                                                    : 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.02))'
                                        }}
                                    >
                                        <span className="group-hover:scale-110 transition-transform duration-300">
                                            {shortcut.icon || '💰'}
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            openShortcut(shortcut);
                                            setShortcutsListOpen(false);
                                        }}
                                        className="flex-1 min-w-0 text-left"
                                    >
                                        <p className="font-semibold text-sm truncate">{shortcut.name}</p>
                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                                            <span className={`px-1.5 py-0.5 rounded-md font-bold uppercase ${shortcut.type === 'expense' ? 'bg-red-500/10 text-red-500' :
                                                shortcut.type === 'income' ? 'bg-green-500/10 text-green-500' :
                                                    'bg-blue-500/10 text-blue-500'
                                                }`}>
                                                {shortcut.type}
                                            </span>
                                            <span className="truncate opacity-80">{categoryLabelById.get(shortcut.categoryId) || 'Category'}</span>
                                            {shortcut.amount !== undefined && (
                                                <CurrencyDisplay
                                                    amount={shortcut.type === 'expense' ? -Math.abs(shortcut.amount) : Math.abs(shortcut.amount)}
                                                    currency={currencyCodeById.get(shortcut.currencyBalanceId)}
                                                    showSign
                                                    className="font-bold text-foreground/80"
                                                />
                                            )}
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className={`h-8 w-8 rounded-full ${shortcut.isFavorite ? 'text-yellow-500 opacity-100' : 'text-muted-foreground'}`}
                                            onClick={() => toggleFavorite(shortcut.id)}
                                        >
                                            {shortcut.isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 rounded-full text-muted-foreground"
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
                                            className="h-8 w-8 rounded-full text-destructive hover:text-white hover:bg-destructive transition-all"
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
                                placeholder={`Remaining: ${recordPaymentSplit?.remaining ? formatAmountAbbreviated(recordPaymentSplit.remaining) : ''}`}
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                            />
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                Remaining: <CurrencyDisplay amount={recordPaymentSplit?.remaining || 0} currency={recordPaymentSplit?.currencyCode} />
                            </div>
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
                                    {banks?.map((bank: { name: string; accounts: Array<{ name: string; currencyBalances: Array<{ id: string; currencyCode: string }> }> }) =>
                                        bank.accounts?.map((account) =>
                                            account.currencyBalances?.map((cb) => (
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
                <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-20 left-4 min-[470px]:left-auto min-[470px]:right-24 min-[470px]:bottom-4 z-40 animate-in fade-in slide-in-from-bottom-5 duration-500">
                    <div className="flex items-end gap-2 min-[850px]:block">
                        <div className="bg-background/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-3 sm:p-4 w-full min-[470px]:w-fit min-w-[150px] max-w-sm mx-auto min-[470px]:mx-0 overflow-hidden">
                            <div className="flex items-center justify-between mb-3 pl-0 pr-1">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Starred</p>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5 rounded-full hover:bg-muted/30"
                                    onClick={() => toggleFavoritesWidget(false)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                            {favoriteShortcuts.length === 0 ? (
                                <div className="text-center py-2">
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Star shortcuts to see them here
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-row overflow-x-auto pb-1 gap-3 min-[470px]:flex-wrap min-[470px]:justify-start scrollbar-hide">
                                    {favoriteShortcuts.map((shortcut) => (
                                        <button
                                            key={shortcut.id}
                                            onClick={() => openShortcut(shortcut)}
                                            className="flex flex-col items-center gap-1.5 shrink-0 group transition-all duration-300 transform active:scale-95"
                                        >
                                            <div
                                                className={cn(
                                                    "h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center text-xl sm:text-2xl transition-all duration-300 border-2 shadow-sm",
                                                    selectedShortcut?.id === shortcut.id && transactionSheetOpen
                                                        ? 'border-primary ring-4 ring-primary/10 bg-primary/5'
                                                        : 'border-border bg-muted/30 hover:bg-muted/50 hover:border-border/80'
                                                )}
                                                style={{
                                                    background: shortcut.type === 'income'
                                                        ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.02))'
                                                        : shortcut.type === 'expense'
                                                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.02))'
                                                            : 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.02))'
                                                }}
                                            >
                                                {shortcut.icon || '💰'}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
