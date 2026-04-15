
import { useState, useMemo, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Trash2, MoreHorizontal, Banknote, Plus, Info, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/PageHeader';
import { AddDebtSheet } from '@/components/AddDebtSheet';
import { AddDebtPaymentSheet } from '@/components/AddDebtPaymentSheet';
import { ActionButton } from '@/components/ui/action-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';

interface Debt {
    id: string;
    personName: string;
    linkedUser?: {
        id: string;
        username: string | null;
        name: string | null;
    } | null;
    personContact?: string | null;
    amount: string | number;
    type: 'i_owe' | 'they_owe';
    status: 'pending' | 'partial' | 'paid' | 'awaiting_approval';
    description?: string | null;
    dueDate?: string | null;
    paidAmount?: string | number | null;
    currencyCode?: string | null;
    currencyBalance: {
        currencyCode: string;
        account: {
            id: string;
            name: string;
            bank?: {
                name: string;
            }
        };
    } | null;
    payments?: {
        id: string;
        amount: string | number;
        paidAt: string;
        note?: string | null;
        transactions?: {
            id: string;
            amount: string;
            currencyBalanceId: string;
        }[];
    }[];
}

const editDebtSchema = z.object({
    personName: z.string().min(1, "Name is required").max(100),
    amount: z.number().positive("Amount must be positive"),
    description: z.string().optional(),
    dueDate: z.string().optional(),
});

type EditDebtForm = z.infer<typeof editDebtSchema>;

const editPaymentSchema = z.object({
    amount: z.number().positive("Amount must be positive"),
    paidAt: z.string().min(1, "Date is required"),
    note: z.string().optional(),
    isSplit: z.boolean(),
    distributions: z.array(z.object({
        currencyBalanceId: z.string().min(1, "Account required"),
        amount: z.number().min(0.01, "Amount must be greater than 0"),
    })).min(1),
});

type EditPaymentForm = z.infer<typeof editPaymentSchema>;

export function DebtsPage() {
    const { data: debtsData, isLoading } = trpc.debt.list.useQuery({}) as { data: { debts: Debt[], total: number } | undefined, isLoading: boolean };
    const { data: incomingDebtRequests } = trpc.debt.listIncomingRequests.useQuery({ limit: 10 }, { refetchInterval: 5000 });
    const { data: incomingSplitRequests } = trpc.splitBill.listIncomingRequests.useQuery({ limit: 10 });
    const { data: pendingIncomingReceipts } = trpc.splitBill.listPendingIncomingReceipts.useQuery({ limit: 10 });
    const { data: pendingSplits, isLoading: isLoadingSplits } = trpc.splitBill.getPendingSplits.useQuery({});
    const { data: accountsData } = trpc.account.list.useQuery({});
    const { data: banks } = trpc.bank.getHierarchy.useQuery();
    const utils = trpc.useUtils();

    const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
    const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
    const [editingPayment, setEditingPayment] = useState<{ id: string, amount: number, note: string | null, paidAt: string, debt: Debt } | null>(null);
    const [detailDebtId, setDetailDebtId] = useState<string | null>(null);

    const detailDebt = useMemo(() => {
        if (!detailDebtId) return null;
        return (debtsData?.debts || []).find(d => d.id === detailDebtId) || null;
    }, [debtsData?.debts, detailDebtId]);

    const setDetailDebt = (debt: Debt | null) => {
        setDetailDebtId(debt?.id || null);
        setDetailPaymentsPage(1);
    };
    const detailHistoryRef = useRef<HTMLDivElement | null>(null);
    const paymentPageSize = 10;
    const [detailPaymentsPage, setDetailPaymentsPage] = useState(1);
    const itemsPerPage = 6;
    const [payablesPage, setPayablesPage] = useState(1);
    const [receivablesPage, setReceivablesPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);

    // Split payment state
    const [recordPaymentSplit, setRecordPaymentSplit] = useState<{
        splitId: string;
        participantName: string;
        remaining: number;
        currencyCode: string;
        transactionId: string;
        transactionDescription: string;
    } | null>(null);
    const [splitPaymentAmount, setSplitPaymentAmount] = useState('');
    const [splitPaymentDate, setSplitPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [splitPaymentAccountId, setSplitPaymentAccountId] = useState('');
    const [incomingDebtAccountSelections, setIncomingDebtAccountSelections] = useState<Record<string, string>>({});
    const [receiptAccountSelections, setReceiptAccountSelections] = useState<Record<string, string>>({});
    const [respondingSplitId, setRespondingSplitId] = useState<string | null>(null);
    const [payNowRequest, setPayNowRequest] = useState<any | null>(null);
    const [payNowAmount, setPayNowAmount] = useState('');
    const [payNowPayerAccountId, setPayNowPayerAccountId] = useState('');
    const [payNowReceiverAccountId, setPayNowReceiverAccountId] = useState('__manual__');

    const recordSplitPayment = trpc.splitBill.recordPayment.useMutation({
        onSuccess: () => {
            utils.splitBill.getPendingSplits.invalidate();
            utils.transaction.list.invalidate();
            toast.success('Payment recorded');
            setRecordPaymentSplit(null);
            setSplitPaymentAmount('');
            setSplitPaymentDate(new Date().toISOString().split('T')[0]);
            setSplitPaymentAccountId('');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to record payment');
        }
    });

    const respondToIncomingSplit = trpc.splitBill.respondToIncomingRequest.useMutation({
        onSuccess: () => {
            utils.splitBill.listIncomingRequests.invalidate();
            utils.splitBill.getPendingSplits.invalidate();
            utils.transaction.list.invalidate();
            utils.debt.list.invalidate();
            utils.notification.list.invalidate();
            toast.success('Split request processed');
            setRespondingSplitId(null);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to process split request');
            setRespondingSplitId(null);
        }
    });

    const payIncomingNow = trpc.splitBill.payIncomingRequestNow.useMutation({
        onSuccess: () => {
            utils.splitBill.listIncomingRequests.invalidate();
            utils.splitBill.getPendingSplits.invalidate();
            utils.transaction.list.invalidate();
            utils.debt.list.invalidate();
            utils.account.list.invalidate();
            utils.account.getTotalBalance.invalidate();
            utils.bank.getHierarchy.invalidate();
            utils.notification.list.invalidate();
            toast.success('Split paid successfully');
            setPayNowRequest(null);
            setPayNowAmount('');
            setPayNowPayerAccountId('');
            setPayNowReceiverAccountId('__manual__');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to process payment');
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

    const { register, handleSubmit, reset, formState: { errors } } = useForm<EditDebtForm>({
        resolver: zodResolver(editDebtSchema),
    });

    const {
        register: registerPayment,
        handleSubmit: handleSubmitPayment,
        reset: resetPayment,
        watch: watchPayment,
        setValue: setValuePayment,
        control: controlPayment,
        formState: { errors: paymentErrors }
    } = useForm<EditPaymentForm>({
        resolver: zodResolver(editPaymentSchema),
    });

    const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({
        control: controlPayment,
        name: "distributions"
    });

    const isPaymentSplit = watchPayment('isSplit');
    const paymentTotalAmount = watchPayment('amount');
    const watchedPaymentDistributions = watchPayment('distributions');

    const availableAccounts = useMemo(() => {
        if (!editingPayment?.debt || !accountsData) return [];
        const debtCurrencyCode = editingPayment.debt.currencyBalance?.currencyCode || editingPayment.debt.currencyCode;
        if (!debtCurrencyCode) return [];

        return (accountsData as any[]).flatMap(acc =>
            (acc.currencyBalances as any[])
                .filter(cb => cb.currencyCode === debtCurrencyCode)
                .map(cb => ({
                    id: cb.id,
                    label: `[${acc.bank?.name || 'Unknown'}] ${acc.name} - ${cb.currencyCode}`
                }))
        );
    }, [editingPayment?.debt, accountsData]);

    const currencyOptions = useMemo(() => {
        if (!banks) return [];
        const options: { id: string; label: string; currencyCode: string; balance: number }[] = [];
        banks.forEach((bank: any) => {
            bank.accounts?.forEach((acc: any) => {
                acc.currencyBalances?.forEach((cb: any) => {
                    options.push({
                        id: cb.id,
                        label: `[${bank.name}] ${acc.name}`,
                        currencyCode: cb.currencyCode,
                        balance: Number(cb.balance),
                    });
                });
            });
        });
        return options;
    }, [banks]);

    const payNowRequestedAmount = Number(payNowAmount) || 0;
    const payNowOriginalRemaining = Number(payNowRequest?.remainingAmount || 0);
    const isPayNowOverpay = payNowRequestedAmount > payNowOriginalRemaining && payNowOriginalRemaining > 0;
    const selectedPayNowAccount = currencyOptions.find((opt) => opt.id === payNowPayerAccountId);
    const isPayNowInsufficient = Boolean(selectedPayNowAccount && payNowRequestedAmount > selectedPayNowAccount.balance);

    // Note: Backend doesn't have debt.update yet, so we'll just show the form
    const updateDebt = trpc.debt.update.useMutation({
        onSuccess: () => {
            utils.debt.list.invalidate();
            toast.success('Debt updated successfully');
            setEditingDebt(null);
            reset();
        },
        onError: (error: unknown) => {
            toast.error('Failed to update debt');
            console.error(error);
        }
    });

    const softDeleteDebt = trpc.debt.softDelete.useMutation({
        onSuccess: () => {
            utils.debt.list.invalidate();
            utils.account.list.invalidate();
        },
        onError: (error: unknown) => {
            toast.error('Failed to delete debt');
            console.error(error);
        }
    });

    const undoDeleteDebt = trpc.debt.undoDelete.useMutation({
        onSuccess: () => {
            utils.debt.list.invalidate();
            utils.account.list.invalidate();
            toast.success('Debt restored');
        },
        onError: (error: unknown) => {
            toast.error('Failed to restore debt');
            console.error(error);
        }
    });

    const deletePayment = trpc.debt.deletePayment.useMutation({
        onSuccess: () => {
            utils.debt.list.invalidate();
            utils.bank.getHierarchy.invalidate();
            utils.account.getTotalBalance.invalidate();
            toast.success('Payment deleted and balance reverted');
        },
        onError: (error: unknown) => {
            toast.error('Failed to delete payment');
            console.error(error);
        }
    });

    const updatePayment = trpc.debt.updatePayment.useMutation({
        onSuccess: () => {
            utils.debt.list.invalidate();
            toast.success('Payment updated successfully');
            setEditingPayment(null);
            resetPayment();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update payment');
            console.error(error);
        }
    });

    const handleEdit = (debt: Debt) => {
        setEditingDebt(debt);
        reset({
            personName: debt.personName,
            amount: Number(debt.amount),
            description: debt.description || '',
            dueDate: debt.dueDate || '',
        });
    };

    const handleEditPayment = (payment: NonNullable<Debt['payments']>[number], debt: Debt) => {
        const distributions = payment.transactions?.map((tx: any) => ({
            currencyBalanceId: tx.currencyBalanceId,
            amount: Number(tx.amount)
        })) || [];

        const isSplit = distributions.length > 1;

        setEditingPayment({
            id: payment.id,
            amount: Number(payment.amount),
            note: payment.note || '',
            paidAt: new Date(payment.paidAt).toISOString().split('T')[0],
            debt
        });

        resetPayment({
            amount: Number(payment.amount),
            note: payment.note || '',
            paidAt: new Date(payment.paidAt).toISOString().split('T')[0],
            isSplit,
            distributions: distributions.length > 0 ? distributions : [{ currencyBalanceId: '', amount: Number(payment.amount) }]
        });
    };

    const handlePayment = (debt: Debt) => {
        setPayingDebt(debt);
    };

    const onSubmitEdit = (data: EditDebtForm) => {
        if (!editingDebt) return;
        updateDebt.mutate({
            id: editingDebt.id,
            ...data
        });
    };

    const onSubmitEditPayment = (data: EditPaymentForm) => {
        if (!editingPayment) return;
        updatePayment.mutate({
            id: editingPayment.id,
            amount: data.amount,
            paidAt: data.paidAt,
            note: data.note,
            distributions: data.distributions
        });
    };

    const handleDelete = (debt: Debt) => {
        softDeleteDebt.mutate({ id: debt.id }, {
            onSuccess: () => {
                toast(`Debt from "${debt.personName}" deleted`, {
                    action: {
                        label: 'Undo',
                        onClick: () => {
                            undoDeleteDebt.mutate({ id: debt.id });
                        },
                    },
                    duration: 5000,
                });
            }
        });
    };

    const allDebts = debtsData?.debts || [];
    const iOweDebts = allDebts.filter(d => d.type === 'i_owe');
    const theyOweDebts = allDebts.filter(d => d.type === 'they_owe');

    const getRemaining = (debt: Debt) => Number(debt.amount) - Number(debt.paidAmount || 0);
    const isSettled = (debt: Debt) => getRemaining(debt) <= 0.01;

    const iOweActive = allDebts.filter(d => d.type === 'i_owe' && !isSettled(d));
    const theyOweActive = allDebts.filter(d => d.type === 'they_owe' && !isSettled(d));
    const historyDebts = allDebts.filter(d => isSettled(d));

    const detailPayments = detailDebt?.payments || [];
    const visibleDetailPayments = detailPayments.slice(0, detailPaymentsPage * paymentPageSize);
    const hasMoreDetailPayments = visibleDetailPayments.length < detailPayments.length;

    const latestDebt = useMemo(() => {
        if (!detailDebt) return null;
        return allDebts.find((debt) => debt.id === detailDebt.id) || null;
    }, [allDebts, detailDebt?.id]);

    // Use latestDebt where needed or just let useMemo handle it via detailDebtId
    // The previous useEffect that was calling setDetailDebt(latest) is no longer needed
    // because detailDebt is now a useMemo that tracks allDebts automatically.

    useEffect(() => {
        const el = detailHistoryRef.current;
        if (!el || !detailDebt) return;

        const onScroll = () => {
            if (!hasMoreDetailPayments) return;
            const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
            if (nearBottom) {
                setDetailPaymentsPage((prev) => prev + 1);
            }
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [detailDebt, hasMoreDetailPayments]);

    const DebtCard = ({ debt, variant = 'active' }: { debt: Debt; variant?: 'active' | 'settled' }) => {
        const remaining = getRemaining(debt);
        const colorClass = debt.type === 'they_owe' ? 'text-green-600' : 'text-red-600';
        const currency = debt.currencyBalance?.currencyCode || debt.currencyCode || 'USD';

        const personNameClean = debt.personName.replace(/^@/, '').toLowerCase();
        const usernameClean = debt.linkedUser?.username?.toLowerCase();
        const isDuplicate = usernameClean === personNameClean;
        const isAwaiting = debt.status === 'awaiting_approval';

        const title = debt.description || (debt.type === 'they_owe' ? 'Lent money' : 'Borrowed money');

        return (
            <div className={`border rounded-md p-3 space-y-2 ${isAwaiting ? 'bg-muted/30 border-dashed' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-sm sm:text-md font-semibold text-foreground truncate">
                                    {title}
                                    {isAwaiting && (
                                        <span className="ml-2 text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                            Pending
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                                    <span>{debt.personName}</span>
                                    {debt.linkedUser?.username && !isDuplicate && (
                                        <span className="opacity-70">(@{debt.linkedUser.username})</span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Due: {debt.dueDate ? new Date(debt.dueDate).toLocaleDateString() : 'No due date'}
                                </div>
                            </div>
                            {variant === 'settled' && (
                                <div className="text-sm font-medium whitespace-nowrap">
                                    <CurrencyDisplay amount={debt.amount} currency={currency} />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {isAwaiting ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
                                onClick={() => {
                                    // Scroll to the notification or just trigger the logic
                                    // For now, let's assume the user can find it in the notifications at the top
                                    // or we could show a separate sheet.
                                    // But the notification is already there.
                                    const notification = incomingDebtRequests?.find((r: any) => r.debtId === debt.id);
                                    if (notification) {
                                        // We can't easily trigger the Select from here without state
                                        // so let's just toast a hint or scroll.
                                        const el = document.getElementById(`notification-${notification.notificationId}`);
                                        if (el) {
                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
                                            setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 3000);
                                        } else {
                                            toast.info("Please respond to this request in the 'Debt Requests' section at the top.");
                                        }
                                    } else {
                                        toast.info("Please respond to this request in the 'Debt Requests' section at the top.");
                                    }
                                }}
                            >
                                Respond
                            </Button>
                        ) : (
                            <>
                                {remaining > 0.01 && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handlePayment(debt)}
                                        title="Record Repayment"
                                    >
                                        <Banknote className="h-4 w-4" />
                                    </Button>
                                )}
                            </>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(debt)}
                            title="Edit"
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailDebt(debt)}>
                                    <Info className="h-4 w-4 mr-2" />
                                    View Details
                                </DropdownMenuItem>
                                {remaining > 0.01 && (
                                    <DropdownMenuItem onClick={() => handlePayment(debt)}>
                                        <Banknote className="h-4 w-4 mr-2" />
                                        Record Repayment
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleEdit(debt)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => handleDelete(debt)}
                                    className="text-red-600 focus:text-red-600"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {variant === 'active' && (
                    <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                        <div>
                            <div className="text-muted-foreground text-xs">Total</div>
                            <div className="font-medium"><CurrencyDisplay amount={debt.amount} currency={currency} /></div>
                        </div>
                        <div className="text-right">
                            <div className="text-muted-foreground text-xs">Remaining</div>
                            <div className={`font-medium ${colorClass}`}><CurrencyDisplay amount={remaining} currency={currency} /></div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4 md:space-y-6">
            <PageHeader
                title="Debts"
                subtitle="Track payables and receivables"
                variant="one"
            >
                <AddDebtSheet
                    trigger={
                        <ActionButton className="sm:flex-none">
                            <Plus className="h-4 w-4" />
                            Add
                        </ActionButton>
                    }
                />
            </PageHeader>
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
                                <div key={request.id} className="rounded-md border bg-background p-3">
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
                                                    decision: 'disapprove',
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
                            {pendingIncomingReceipts.map((receipt: any) => (
                                <div key={receipt.paymentId} className="rounded-md border bg-background p-3">
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
                                            <Label className="text-xs text-muted-foreground">Receive to account</Label>
                                            <Select
                                                value={receiptAccountSelections[receipt.paymentId]}
                                                onValueChange={(val) => {
                                                    setReceiptAccountSelections((prev) => ({
                                                        ...prev,
                                                        [receipt.paymentId]: val,
                                                    }));
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select account" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {currencyOptions
                                                        .filter((opt) => opt.currencyCode === receipt.currencyCode)
                                                        .map((opt) => (
                                                            <SelectItem key={opt.id} value={opt.id}>
                                                                {opt.label} ({opt.currencyCode})
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
                            ))}
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
                                    <div key={request.notificationId} id={`notification-${request.notificationId}`} className="rounded-md border bg-background p-3 transition-all duration-300">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {request.requesterName || 'Friend'}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {isFundingRequest ? 'Borrow request (pay from your card)' : 'Incoming debt transfer (choose receive card)'}
                                                </p>
                                            </div>
                                            <CurrencyDisplay
                                                amount={Number(request.amount || 0)}
                                                currency={request.currencyCode}
                                                className="text-sm font-semibold"
                                            />
                                        </div>
                                        <div className="mt-2 space-y-2">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">
                                                    {isFundingRequest ? 'Pay from card' : 'Receive to card'}
                                                </Label>
                                                <Select
                                                    value={selectedAccountId}
                                                    onValueChange={(val) => {
                                                        setIncomingDebtAccountSelections((prev) => ({
                                                            ...prev,
                                                            [request.notificationId]: val,
                                                        }));
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select card" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {currencyOptions
                                                            .filter((opt) => opt.currencyCode === request.currencyCode)
                                                            .map((opt) => (
                                                                <SelectItem key={opt.id} value={opt.id}>
                                                                    {opt.label} ({opt.currencyCode})
                                                                </SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {isInsufficient && (
                                                <p className="text-xs text-red-500">
                                                    Insufficient funds in selected card.
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={!selectedAccountId || isInsufficient || respondToIncomingDebtRequest.isPending}
                                                    onClick={() => {
                                                        if (!selectedAccountId) return;
                                                        respondToIncomingDebtRequest.mutate({
                                                            notificationId: request.notificationId,
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
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={respondToIncomingDebtRequest.isPending}
                                                    onClick={() => {
                                                        respondToIncomingDebtRequest.mutate({
                                                            notificationId: request.notificationId,
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
            <div className="grid gap-3 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-red-600">Borrowed</CardTitle>
                        <CardDescription>Outstanding amounts you need to repay</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                                        <Skeleton className="h-5 w-24" />
                                        <Skeleton className="h-5 w-16" />
                                    </div>
                                ))}
                            </div>
                        ) : iOweActive.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">No debts to pay</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {iOweActive
                                    .slice((payablesPage - 1) * itemsPerPage, payablesPage * itemsPerPage)
                                    .map(debt => (
                                        <DebtCard key={debt.id} debt={debt} />
                                    ))}
                            </div>
                        )}
                        {iOweActive.length > itemsPerPage && (
                            <div className="flex flex-col items-center justify-center mt-4 gap-2">
                                <div className="text-xs text-muted-foreground">
                                    Showing {Math.min(iOweActive.length, (payablesPage - 1) * itemsPerPage + 1)}-
                                    {Math.min(iOweActive.length, payablesPage * itemsPerPage)} of {iOweActive.length}
                                </div>
                                <div className="flex flex-col gap-2 w-full">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setPayablesPage(prev => Math.max(1, prev - 1))}
                                        disabled={payablesPage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setPayablesPage(prev => Math.min(Math.ceil(iOweActive.length / itemsPerPage), prev + 1))}
                                        disabled={payablesPage >= Math.ceil(iOweActive.length / itemsPerPage)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-green-600">Lends</CardTitle>
                        <CardDescription>Outstanding amounts others need to repay</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {(isLoading || isLoadingSplits) ? (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                                        <Skeleton className="h-5 w-24" />
                                        <Skeleton className="h-5 w-16" />
                                    </div>
                                ))}
                            </div>
                        ) : (theyOweActive.length === 0 && (!pendingSplits || pendingSplits.length === 0)) ? (
                            <p className="text-muted-foreground text-center py-4">No one owes you</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {/* Regular debts */}
                                {theyOweActive
                                    .slice((receivablesPage - 1) * itemsPerPage, receivablesPage * itemsPerPage)
                                    .map(debt => (
                                        <DebtCard key={debt.id} debt={debt} />
                                    ))}
                                
                                {/* Pending splits from transactions */}
                                {pendingSplits && pendingSplits.length > 0 && (
                                    <>
                                        {theyOweActive.length > 0 && (
                                            <div className="border-t pt-3 mt-3">
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">From Split Bills</p>
                                            </div>
                                        )}
                                        {pendingSplits.map((split: any) => {
                                            // Defensive access for amounts (try both camelCase and snake_case)
                                            const owedRaw = split.owedAmount ?? split.owed_amount;
                                            const paidRaw = split.paidAmount ?? split.paid_amount;
                                            const owed = owedRaw ? Number(owedRaw) : 0;
                                            const paid = paidRaw ? Number(paidRaw) : 0;
                                            const remaining = Math.max(0, owed - paid);
                                            
                                            const transaction = split.transaction;
                                            const currency = transaction?.currencyBalance?.currencyCode || transaction?.currencyBalance?.currency?.code || 'USD';
                                            const description = transaction?.description || transaction?.category?.name || 'Split bill';
                                            const dateValue = transaction?.date || split.createdAt;
                                            const dateDisplay = dateValue ? new Date(dateValue).toLocaleDateString() : 'Unknown date';
                                            
                                            const participant = split.participant;
                                            const pName = participant?.name || 'Unknown';
                                            const pColor = participant?.color || '#6366f1';
                                            
                                            return (
                                                <div key={split.id} className="border-t border-border p-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className="h-9 w-9 rounded-full flex items-center justify-center text-xs text-white font-medium shrink-0"
                                                                style={{ backgroundColor: pColor }}
                                                            >
                                                                {pName.slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className="font-semibold text-sm truncate">{description}</div>
                                                                <div className="text-xs text-muted-foreground">{pName}</div>
                                                                <div className="text-[10px] text-muted-foreground opacity-70 mt-0.5">{dateDisplay}</div>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 shrink-0"
                                                            onClick={() => {
                                                                setSplitPaymentAmount(String(remaining));
                                                                setRecordPaymentSplit({
                                                                    splitId: split.id,
                                                                    participantName: pName,
                                                                    remaining,
                                                                    currencyCode: currency,
                                                                    transactionId: split.transactionId,
                                                                    transactionDescription: description,
                                                                });
                                                            }}
                                                        >
                                                            <Banknote className="h-4 w-4 mr-1" />
                                                            Record
                                                        </Button>
                                                    </div>
                                                    <div className="mt-2 border-t pt-2">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <div>
                                                                <div className="text-muted-foreground">Total</div>
                                                                <div className="font-medium"><CurrencyDisplay amount={owed} currency={currency} /></div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-muted-foreground">Remaining</div>
                                                                <div className="font-medium text-green-600"><CurrencyDisplay amount={remaining} currency={currency} /></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        )}
                        {theyOweActive.length > itemsPerPage && (
                            <div className="flex flex-col items-center justify-center mt-4 gap-2">
                                <div className="text-xs text-muted-foreground">
                                    Showing {Math.min(theyOweActive.length, (receivablesPage - 1) * itemsPerPage + 1)}-
                                    {Math.min(theyOweActive.length, receivablesPage * itemsPerPage)} of {theyOweActive.length}
                                </div>
                                <div className="flex flex-col gap-2 w-full">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setReceivablesPage(prev => Math.max(1, prev - 1))}
                                        disabled={receivablesPage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setReceivablesPage(prev => Math.min(Math.ceil(theyOweActive.length / itemsPerPage), prev + 1))}
                                        disabled={receivablesPage >= Math.ceil(theyOweActive.length / itemsPerPage)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>History</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 2 }).map((_, i) => (
                                <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                                    <Skeleton className="h-5 w-24" />
                                    <Skeleton className="h-5 w-16" />
                                </div>
                            ))}
                        </div>
                    ) : historyDebts.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No history yet</p>
                    ) : (
                                <div className="divide-y divide-border">
                                    {historyDebts
                                        .slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage)
                                        .map(debt => (
                                            <DebtCard key={debt.id} debt={debt} variant="settled" />
                                        ))}
                                </div>
                    )}
                    {historyDebts.length > itemsPerPage && (
                        <div className="flex flex-col items-center justify-center mt-4 gap-2">
                            <div className="text-xs text-muted-foreground">
                                Showing {Math.min(historyDebts.length, (historyPage - 1) * itemsPerPage + 1)}-
                                {Math.min(historyDebts.length, historyPage * itemsPerPage)} of {historyDebts.length}
                            </div>
                            <div className="flex flex-col gap-2 w-full">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-[10px] w-full"
                                    onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                                    disabled={historyPage === 1}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-[10px] w-full"
                                    onClick={() => setHistoryPage(prev => Math.min(Math.ceil(historyDebts.length / itemsPerPage), prev + 1))}
                                    disabled={historyPage >= Math.ceil(historyDebts.length / itemsPerPage)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Sheet open={!!detailDebt} onOpenChange={(open) => !open && setDetailDebt(null)}>
                <SheetContent className="sm:max-w-[560px]">
                    <SheetHeader>
                        <SheetTitle>{detailDebt?.personName}</SheetTitle>
                        <SheetDescription>
                            {detailDebt?.type === 'i_owe' ? 'Payable' : 'Receivable'} details
                        </SheetDescription>
                    </SheetHeader>
                    {detailDebt && (
                        <div className="flex h-[min(70vh,700px)] flex-col gap-4 pt-4">
                            <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
                                <div>
                                    <p className="text-xs text-muted-foreground">Type</p>
                                    <p className="text-sm font-medium">{detailDebt.type === 'i_owe' ? 'Payable' : 'Receivable'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Due Date</p>
                                    <p className="text-sm font-medium">
                                        {detailDebt.dueDate ? new Date(detailDebt.dueDate).toLocaleDateString() : 'No due date'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Total</p>
                                    <p className="text-sm font-medium">
                                        <CurrencyDisplay amount={detailDebt.amount} currency={detailDebt.currencyBalance?.currencyCode || detailDebt.currencyCode || 'USD'} />
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Remaining</p>
                                    <p className={`text-sm font-medium ${detailDebt.type === 'they_owe' ? 'text-green-600' : 'text-red-600'}`}>
                                        <CurrencyDisplay amount={getRemaining(detailDebt)} currency={detailDebt.currencyBalance?.currencyCode || detailDebt.currencyCode || 'USD'} />
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 border-b pb-3">
                                {getRemaining(detailDebt) > 0.01 && (
                                    <Button size="sm" className="h-8" onClick={() => handlePayment(detailDebt)}>
                                        <Banknote className="h-4 w-4 mr-1" />
                                        Repayment
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" className="h-8" onClick={() => handleEdit(detailDebt)}>
                                    <Pencil className="h-4 w-4 mr-1" />
                                    Edit
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => handleDelete(detailDebt)}
                                >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                </Button>
                            </div>

                            {(detailDebt.description || detailDebt.personContact) && (
                                <div className="space-y-1 rounded-md border p-2">
                                    {detailDebt.description && (
                                        <div>
                                            <p className="text-xs text-muted-foreground">Description</p>
                                            <p className="text-sm">{detailDebt.description}</p>
                                        </div>
                                    )}
                                    {detailDebt.personContact && (
                                        <div>
                                            <p className="text-xs text-muted-foreground">Contact</p>
                                            <p className="text-sm">{detailDebt.personContact}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-1 flex-col gap-2">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment History</p>
                                    <span className="text-xs text-muted-foreground">
                                        {visibleDetailPayments.length}/{detailPayments.length}
                                    </span>
                                </div>
                                {detailPayments.length === 0 ? (
                                    <div className="flex flex-1 items-center justify-center rounded-md border text-sm text-muted-foreground">
                                        No payments recorded yet.
                                    </div>
                                ) : (
                                    <div
                                        ref={detailHistoryRef}
                                        className="flex-1 overflow-y-auto rounded-md border"
                                    >
                                        <div className="space-y-1 p-2">
                                            {visibleDetailPayments.map((payment) => (
                                                <div key={payment.id} className="flex items-center justify-between rounded border-b border-muted/30 px-2 py-2 text-xs">
                                                    <div className="min-w-0">
                                                        <span className={detailDebt.type === 'they_owe' ? 'text-green-600' : 'text-red-600'}>
                                                            {detailDebt.type === 'i_owe' ? '-' : '+'}{' '}
                                                            <CurrencyDisplay
                                                                amount={payment.amount}
                                                                currency={detailDebt.currencyBalance?.currencyCode || detailDebt.currencyCode || 'USD'}
                                                            />
                                                        </span>
                                                        <span className="ml-2 text-muted-foreground">
                                                            {new Date(payment.paidAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <div className="ml-2 flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => handleEditPayment(payment, detailDebt)}
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => {
                                                                if (confirm('Delete this payment and revert balance?')) {
                                                                    deletePayment.mutate({ id: payment.id });
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                            {hasMoreDetailPayments && (
                                                <div className="py-2 text-center text-xs text-muted-foreground">
                                                    Scroll to load more
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            <AddDebtPaymentSheet
                debt={payingDebt}
                open={!!payingDebt}
                onOpenChange={(open) => !open && setPayingDebt(null)}
            />

            <Sheet open={!!editingDebt} onOpenChange={(open) => !open && setEditingDebt(null)}>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Edit Debt</SheetTitle>
                        <SheetDescription>
                            Update debt details.
                        </SheetDescription>
                    </SheetHeader>
                    <form onSubmit={handleSubmit(onSubmitEdit)} className="space-y-6 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="edit-personName">Person/Entity Name</Label>
                            <Input id="edit-personName" {...register('personName')} />
                            {errors.personName && <p className="text-sm text-red-500">{errors.personName.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-amount">Total Amount</Label>
                            <Input id="edit-amount" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} />
                            {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-description">Description</Label>
                            <Input id="edit-description" {...register('description')} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-dueDate">Due Date</Label>
                            <Input id="edit-dueDate" type="date" {...register('dueDate')} />
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

            <Sheet open={!!editingPayment} onOpenChange={(open) => !open && setEditingPayment(null)}>
                <SheetContent className="sm:max-w-[500px]">
                    <SheetHeader>
                        <SheetTitle>Edit Repayment</SheetTitle>
                        <SheetDescription>
                            Update repayment details and distributions.
                        </SheetDescription>
                    </SheetHeader>
                    <form onSubmit={handleSubmitPayment(onSubmitEditPayment)} className="space-y-6 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="edit-pt-amount">Amount</Label>
                            <Input id="edit-pt-amount" type="number" step="0.01" {...registerPayment('amount', { valueAsNumber: true })} />
                            {paymentErrors.amount && <p className="text-sm text-red-500">{paymentErrors.amount.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-pt-date">Date</Label>
                            <Input id="edit-pt-date" type="date" {...registerPayment('paidAt')} />
                            {paymentErrors.paidAt && <p className="text-sm text-red-500">{paymentErrors.paidAt.message}</p>}
                        </div>

                        <div className="flex items-center space-x-2">
                            <Switch
                                id="is-payment-split"
                                checked={isPaymentSplit}
                                onCheckedChange={(checked: boolean) => setValuePayment('isSplit', checked)}
                            />
                            <Label htmlFor="is-payment-split">Split across multiple accounts</Label>
                        </div>

                        {!isPaymentSplit ? (
                            <div className="space-y-2">
                                <Label htmlFor="repayment-account">
                                    {editingPayment?.debt.type === 'i_owe' ? 'Payment Account' : 'Destination Account'}
                                </Label>
                                <Select
                                    value={watchPayment('distributions.0.currencyBalanceId')}
                                    onValueChange={(val: string) => {
                                        setValuePayment('distributions.0.currencyBalanceId', val);
                                        setValuePayment('distributions.0.amount', paymentTotalAmount);
                                    }}
                                >
                                    <SelectTrigger id="repayment-account">
                                        <SelectValue placeholder="Select account" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableAccounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id}>
                                                {acc.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <Label>Distributions</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => appendPayment({ currencyBalanceId: '', amount: 0 })}
                                    >
                                        <Plus className="h-4 w-4 mr-1" /> Add
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                                    {paymentFields.map((field, index) => (
                                        <div key={field.id} className="flex gap-2 items-end">
                                            <div className="flex-1 space-y-1">
                                                <Label className="text-xs" htmlFor={`distribution-account-${index}`}>Account</Label>
                                                <Select
                                                    value={watchedPaymentDistributions?.[index]?.currencyBalanceId}
                                                    onValueChange={(val: string) => setValuePayment(`distributions.${index}.currencyBalanceId`, val)}
                                                >
                                                    <SelectTrigger id={`distribution-account-${index}`}>
                                                        <SelectValue placeholder="Select" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableAccounts.map(acc => (
                                                            <SelectItem key={acc.id} value={acc.id}>
                                                                {acc.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-24 space-y-1">
                                                <Label className="text-xs" htmlFor={`distribution-amount-${index}`}>Amount</Label>
                                                <Input
                                                    id={`distribution-amount-${index}`}
                                                    type="number"
                                                    step="0.01"
                                                    {...registerPayment(`distributions.${index}.amount`, { valueAsNumber: true })}
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 mb-0.5"
                                                onClick={() => removePayment(index)}
                                                disabled={paymentFields.length === 1}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                {paymentErrors.distributions && <p className="text-sm text-red-500">{paymentErrors.distributions.message}</p>}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="edit-pt-note">Note</Label>
                            <Input id="edit-pt-note" {...registerPayment('note')} />
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

            {/* Record Split Payment Sheet */}
            <Sheet open={!!recordPaymentSplit} onOpenChange={(open) => !open && setRecordPaymentSplit(null)}>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Record Payment</SheetTitle>
                        <SheetDescription>
                            Record payment from {recordPaymentSplit?.participantName} for "{recordPaymentSplit?.transactionDescription}"
                        </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="split-payment-amount">Amount ({recordPaymentSplit?.currencyCode})</Label>
                            <Input
                                id="split-payment-amount"
                                name="split-payment-amount"
                                type="number"
                                placeholder={`Remaining: ${recordPaymentSplit?.remaining?.toLocaleString()}`}
                                value={splitPaymentAmount}
                                onChange={(e) => setSplitPaymentAmount(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Remaining: {recordPaymentSplit?.currencyCode} {recordPaymentSplit?.remaining?.toLocaleString()}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="split-payment-date">Date</Label>
                            <Input
                                id="split-payment-date"
                                name="split-payment-date"
                                type="date"
                                value={splitPaymentDate}
                                onChange={(e) => setSplitPaymentDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="receive-account">Receive to Account</Label>
                            <Select
                                value={splitPaymentAccountId}
                                onValueChange={setSplitPaymentAccountId}
                            >
                                <SelectTrigger id="receive-account">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {banks?.map((bank: any) =>
                                        bank.accounts?.map((account: any) =>
                                            account.currencyBalances?.map((cb: any) => (
                                                <SelectItem key={cb.id} value={cb.id}>
                                                    [{bank?.name || 'Unknown'}] {account?.name || 'Unknown Account'} ({cb.currencyCode})
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
                                disabled={!splitPaymentAmount || !splitPaymentAccountId || recordSplitPayment.isPending}
                                onClick={() => {
                                    if (!recordPaymentSplit || !splitPaymentAmount || !splitPaymentAccountId) return;
                                    recordSplitPayment.mutate({
                                        splitId: recordPaymentSplit.splitId,
                                        amount: parseFloat(splitPaymentAmount),
                                        receivedToCurrencyBalanceId: splitPaymentAccountId,
                                        createIncomeTransaction: true,
                                        date: splitPaymentDate,
                                    });
                                }}
                            >
                                {recordSplitPayment.isPending ? 'Recording...' : 'Record Payment'}
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <Sheet open={!!payNowRequest} onOpenChange={(open) => {
                if (!open) {
                    setPayNowRequest(null);
                }
            }}>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>Pay Split Now</SheetTitle>
                        <SheetDescription>
                            Pay directly from one of your cards.
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
                        </div>
                        <div className="space-y-2">
                            <Label>Paid from your account</Label>
                            <Select value={payNowPayerAccountId} onValueChange={setPayNowPayerAccountId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select your account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencyOptions
                                        .filter((opt) => opt.currencyCode === payNowRequest?.transaction?.currencyBalance?.currencyCode)
                                        .map((opt) => (
                                            <SelectItem key={opt.id} value={opt.id}>
                                                {opt.label} ({opt.currencyCode})
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
                        <Button
                            className="w-full"
                            disabled={!payNowAmount || !payNowPayerAccountId || payIncomingNow.isPending || isPayNowInsufficient}
                            onClick={() => {
                                if (!payNowRequest || !payNowAmount || !payNowPayerAccountId) return;
                                if (isPayNowOverpay) {
                                    toast.error('Amount cannot exceed remaining balance');
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
        </div>
    );
}
