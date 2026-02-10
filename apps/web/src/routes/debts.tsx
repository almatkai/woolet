
import { useState, useRef, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Trash2, MoreHorizontal, Banknote, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AddDebtSheet } from '@/components/AddDebtSheet';
import { AddDebtPaymentSheet } from '@/components/AddDebtPaymentSheet';
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
    personContact?: string | null;
    amount: string | number;
    type: 'i_owe' | 'they_owe';
    status: 'pending' | 'partial' | 'paid';
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
    const { data: pendingSplits, isLoading: isLoadingSplits } = trpc.splitBill.getPendingSplits.useQuery({});
    const { data: accountsData } = trpc.account.list.useQuery({});
    const { data: banks } = trpc.bank.getHierarchy.useQuery();
    const utils = trpc.useUtils();

    const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
    const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
    const [editingPayment, setEditingPayment] = useState<{ id: string, amount: number, note: string | null, paidAt: string, debt: Debt } | null>(null);
    const deleteTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
    const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
    const itemsPerPage = 6;
    const [activePage, setActivePage] = useState(1);
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

    const allDebts = debtsData?.debts.filter(d => !pendingDeletes.has(d.id)) || [];
    const iOweDebts = allDebts.filter(d => d.type === 'i_owe');
    const theyOweDebts = allDebts.filter(d => d.type === 'they_owe');

    const getRemaining = (debt: Debt) => Number(debt.amount) - Number(debt.paidAmount || 0);
    const isSettled = (debt: Debt) => getRemaining(debt) <= 0.01;

    const iOweActive = allDebts.filter(d => d.type === 'i_owe' && !isSettled(d));
    const theyOweActive = allDebts.filter(d => d.type === 'they_owe' && !isSettled(d));
    const historyDebts = allDebts.filter(d => isSettled(d));

    const formatAmount = (amount: string | number, currency: string) => {
        return Number(amount).toLocaleString('en-US', { style: 'currency', currency });
    };

    const DebtCard = ({ debt }: { debt: Debt }) => {
        const remaining = getRemaining(debt);
        const colorClass = debt.type === 'they_owe' ? 'text-green-600' : 'text-red-600';
        const currency = debt.currencyBalance?.currencyCode || debt.currencyCode || 'USD';

        return (
            <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-md">{debt.personName}</div>
                        {debt.description && (
                            <div className="text-sm text-muted-foreground italic">
                                {debt.description}
                            </div>
                        )}
                        {debt.dueDate && (
                            <div className="text-sm text-muted-foreground">
                                Due: {new Date(debt.dueDate).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {debt.type === 'they_owe' && remaining > 0.01 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handlePayment(debt)}
                                title="Add Repayment"
                            >
                                <Banknote className="h-4 w-4" />
                            </Button>
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
                                {debt.type === 'they_owe' && remaining > 0.01 && (
                                    <DropdownMenuItem onClick={() => handlePayment(debt)}>
                                        <Banknote className="h-4 w-4 mr-2" />
                                        Add Repayment
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

                <div className="grid grid-cols-3 gap-2 text-sm border-t pt-3">
                    <div>
                        <div className="text-muted-foreground text-xs">Total</div>
                        <div className="font-medium"><CurrencyDisplay amount={debt.amount} currency={currency} /></div>
                    </div>
                    <div className="text-right">
                        <div className="text-muted-foreground text-xs">Paid</div>
                        <div className="font-medium">{Number(debt.paidAmount) > 0 ? <CurrencyDisplay amount={debt.paidAmount || 0} currency={currency} /> : '-'}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-muted-foreground text-xs">Remaining</div>
                        <div className={`font-medium ${colorClass}`}><CurrencyDisplay amount={remaining} currency={currency} /></div>
                    </div>
                </div>

                {debt.payments && debt.payments.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment History</p>
                        <div className="space-y-1.5">
                            {debt.payments.map(payment => (
                                <div key={payment.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                                    <div className="flex-1 min-w-0">
                                        <span className={colorClass}>
                                            {debt.type === 'i_owe' ? '-' : '+'} <CurrencyDisplay amount={payment.amount} currency={currency} />
                                        </span>
                                        <span className="text-muted-foreground ml-2">{new Date(payment.paidAt).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                            onClick={() => handleEditPayment(payment, debt)}
                                            title="Edit Payment"
                                        >
                                            <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-red-500 hover:text-red-700 hover:bg-red-100"
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
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Debts</h1>
                    <p className="hidden sm:block text-sm md:text-base text-muted-foreground">Track who owes you and who you owe</p>
                </div>
                <AddDebtSheet />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-red-600">I Owe</CardTitle>
                        <CardDescription>Money you need to pay back</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                                        <Skeleton className="h-5 w-24" />
                                        <Skeleton className="h-5 w-16" />
                                    </div>
                                ))}
                            </div>
                        ) : iOweActive.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">No debts to pay</p>
                        ) : (
                            <div className="space-y-3">
                                {iOweActive
                                    .slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage)
                                    .map(debt => (
                                        <DebtCard key={debt.id} debt={debt} />
                                    ))}
                            </div>
                        )}
                        {iOweActive.length > itemsPerPage && (
                            <div className="flex flex-col items-center justify-center mt-4 gap-2">
                                <div className="text-xs text-muted-foreground">
                                    Showing {Math.min(iOweActive.length, (activePage - 1) * itemsPerPage + 1)}-
                                    {Math.min(iOweActive.length, activePage * itemsPerPage)} of {iOweActive.length}
                                </div>
                                <div className="flex flex-col gap-2 w-full">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setActivePage(prev => Math.max(1, prev - 1))}
                                        disabled={activePage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setActivePage(prev => Math.min(Math.ceil(iOweActive.length / itemsPerPage), prev + 1))}
                                        disabled={activePage >= Math.ceil(iOweActive.length / itemsPerPage)}
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
                        <CardTitle className="text-green-600">They Owe Me</CardTitle>
                        <CardDescription>Money others need to pay you (including split bills)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {(isLoading || isLoadingSplits) ? (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                                        <Skeleton className="h-5 w-24" />
                                        <Skeleton className="h-5 w-16" />
                                    </div>
                                ))}
                            </div>
                        ) : (theyOweActive.length === 0 && (!pendingSplits || pendingSplits.length === 0)) ? (
                            <p className="text-muted-foreground text-center py-4">No one owes you</p>
                        ) : (
                            <div className="space-y-3">
                                {/* Regular debts */}
                                {theyOweActive
                                    .slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage)
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
                                                <div key={split.id} className="border rounded-lg p-4 space-y-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <div 
                                                                className="h-10 w-10 rounded-full flex items-center justify-center text-sm text-white font-medium shrink-0"
                                                                style={{ backgroundColor: pColor }}
                                                            >
                                                                {pName.slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className="font-medium">{pName}</div>
                                                                <div className="text-sm text-muted-foreground">
                                                                    {description}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground">
                                                                    {dateDisplay}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 shrink-0"
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
                                                            Record Payment
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-sm border-t pt-3">
                                                        <div>
                                                            <div className="text-muted-foreground text-xs">Total</div>
                                                            <div className="font-medium"><CurrencyDisplay amount={owed} currency={currency} /></div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-muted-foreground text-xs">Paid</div>
                                                            <div className="font-medium">{paid > 0 ? <CurrencyDisplay amount={paid} currency={currency} /> : '-'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-muted-foreground text-xs">Remaining</div>
                                                            <div className="font-medium text-green-600"><CurrencyDisplay amount={remaining} currency={currency} /></div>
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
                                    Showing {Math.min(theyOweActive.length, (activePage - 1) * itemsPerPage + 1)}-
                                    {Math.min(theyOweActive.length, activePage * itemsPerPage)} of {theyOweActive.length}
                                </div>
                                <div className="flex flex-col gap-2 w-full">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setActivePage(prev => Math.max(1, prev - 1))}
                                        disabled={activePage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] w-full"
                                        onClick={() => setActivePage(prev => Math.min(Math.ceil(theyOweActive.length / itemsPerPage), prev + 1))}
                                        disabled={activePage >= Math.ceil(theyOweActive.length / itemsPerPage)}
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
                    <CardDescription>Settled debts (remaining $0)</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 2 }).map((_, i) => (
                                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                                    <Skeleton className="h-5 w-24" />
                                    <Skeleton className="h-5 w-16" />
                                </div>
                            ))}
                        </div>
                    ) : historyDebts.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No history yet</p>
                    ) : (
                        <div className="space-y-3">
                            {historyDebts
                                .slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage)
                                .map(debt => (
                                    <DebtCard key={debt.id} debt={debt} />
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
                                <Label htmlFor="destination-account">Destination Account</Label>
                                <Select
                                    value={watchPayment('distributions.0.currencyBalanceId')}
                                    onValueChange={(val: string) => {
                                        setValuePayment('distributions.0.currencyBalanceId', val);
                                        setValuePayment('distributions.0.amount', paymentTotalAmount);
                                    }}
                                >
                                    <SelectTrigger id="destination-account">
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
                                                    value={watchPayment(`distributions.${index}.currencyBalanceId`)}
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
        </div>
    );
}
