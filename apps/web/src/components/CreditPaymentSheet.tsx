import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CreditCard, Wallet, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CreditPaymentSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    credit: {
        id: string;
        name: string;
        monthlyPayment: string;
        remainingBalance: string;
        currency: string;
        startDate: string;
        endDate: string;
        account: {
            name: string;
            currencyBalances: Array<{
                currencyCode: string;
                balance: string;
            }>;
        };
        payments: Array<{
            monthYear: string;
        }>;
    } | null;
}

// Helper to generate all months between two dates
function getMonthsBetween(startDate: string, endDate: string): string[] {
    const months: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    const current = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endMonth) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        months.push(`${year}-${month}`);
        current.setMonth(current.getMonth() + 1);
    }

    return months;
}

// Format month for display
function formatMonth(monthYear: string): string {
    const [year, month] = monthYear.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Get current month in YYYY-MM format
function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function CreditPaymentSheet({ open, onOpenChange, credit }: CreditPaymentSheetProps) {
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [skipPayment, setSkipPayment] = useState(false);
    const utils = trpc.useUtils();

    const markAsPaid = trpc.credit.markAsPaid.useMutation();
    const makePayment = trpc.credit.makeMonthlyPayment.useMutation({
        onSuccess: (data: { paidMonths: string[] }) => {
            utils.credit.list.invalidate();
            utils.bank.getHierarchy.invalidate();
            toast.success(`Payment successful! Paid ${data.paidMonths.length} month(s)`);
            setSelectedMonths([]);
            onOpenChange(false);
        },
        onError: (error: { message?: string }) => toast.error(error.message || 'Payment failed'),
    });

    // Calculate all months for this credit
    const allMonths = useMemo(() => {
        if (!credit) return [];
        return getMonthsBetween(credit.startDate, credit.endDate);
    }, [credit]);

    // Get paid months
    const paidMonths = useMemo(() => {
        if (!credit) return new Set<string>();
        return new Set(credit.payments.map(p => p.monthYear));
    }, [credit]);

    // Get unpaid months
    const unpaidMonths = useMemo(() => {
        return allMonths.filter(m => !paidMonths.has(m));
    }, [allMonths, paidMonths]);

    // Get account balance for credit's currency
    const accountBalance = useMemo(() => {
        if (!credit) return 0;
        const balance = credit.account.currencyBalances.find(
            cb => cb.currencyCode === credit.currency
        );
        return balance ? Number(balance.balance) : 0;
    }, [credit]);

    // Calculate total payment
    const monthlyPayment = credit ? Number(credit.monthlyPayment) : 0;
    const totalPayment = selectedMonths.length * monthlyPayment;
    const hasInsufficientBalance = totalPayment > accountBalance;

    // Current month
    const currentMonth = getCurrentMonth();

    const toggleMonth = (month: string) => {
        setSelectedMonths(prev =>
            prev.includes(month)
                ? prev.filter(m => m !== month)
                : [...prev, month].sort()
        );
    };

    const selectCurrentMonth = () => {
        if (unpaidMonths.includes(currentMonth)) {
            setSelectedMonths([currentMonth]);
        }
    };

    const selectAllUntilCurrent = () => {
        const monthsToSelect = unpaidMonths.filter(m => m < currentMonth);
        setSelectedMonths(monthsToSelect);
    };

    const handleSubmit = async () => {
        if (!credit || selectedMonths.length === 0) return;

        try {
            if (skipPayment) {
                await markAsPaid.mutateAsync({
                    creditId: credit.id,
                    months: selectedMonths,
                });
                utils.credit.list.invalidate();
                utils.bank.getHierarchy.invalidate();
                toast.success(`Marked ${selectedMonths.length} month(s) as paid`);
            } else {
                await makePayment.mutateAsync({
                    creditId: credit.id,
                    months: selectedMonths,
                });
                // Success handled in mutation callback
            }

            if (skipPayment) {
                setSelectedMonths([]);
                setSkipPayment(false);
                onOpenChange(false);
            }
        } catch (error: any) {
            if (skipPayment) {
                toast.error(error.message || 'Failed to mark as paid');
            }
        }
    };

    if (!credit) return null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-[500px] flex flex-col">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Pay {credit.name}
                    </SheetTitle>
                    <SheetDescription>
                        Select months to pay. Money will be deducted from your linked account.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 py-4 overflow-hidden flex flex-col">
                    {/* Payment Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="text-xs text-muted-foreground mb-1">Monthly Payment</div>
                            <div className="font-semibold">
                                {credit.currency} {Number(credit.monthlyPayment).toLocaleString()}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                <Wallet className="h-3 w-3" /> Account Balance
                            </div>
                            <div className={`font-semibold ${hasInsufficientBalance && selectedMonths.length > 0 ? 'text-destructive' : ''}`}>
                                {credit.currency} {accountBalance.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-2">
                        {paidMonths.has(currentMonth) && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                <span className="font-medium">
                                    Current month ({formatMonth(currentMonth)}) is already paid
                                </span>
                            </div>
                        )}
                        <div className="flex gap-2">
                            {unpaidMonths.includes(currentMonth) && (
                                <Button
                                    variant="outline"
                                    className="flex-1 justify-start gap-2"
                                    onClick={selectCurrentMonth}
                                >
                                    <Calendar className="h-4 w-4" />
                                    Pay Current
                                </Button>
                            )}
                            {unpaidMonths.some(m => m < currentMonth) && (
                                <Button
                                    variant="outline"
                                    className="flex-1 justify-start gap-2"
                                    onClick={selectAllUntilCurrent}
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Select all until current
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Month Selection */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <Label className="mb-2">Select Months to Pay</Label>
                        <ScrollArea className="flex-1 border rounded-lg">
                            <div className="p-3 space-y-2">
                                {allMonths.map((month) => {
                                    const isPaid = paidMonths.has(month);
                                    const isSelected = selectedMonths.includes(month);
                                    const isCurrent = month === currentMonth;

                                    return (
                                        <div
                                            key={month}
                                            className={`flex items-center justify-between p-2 rounded-md transition-colors ${isPaid
                                                ? 'bg-green-500/10'
                                                : isSelected
                                                    ? 'bg-primary/10'
                                                    : 'hover:bg-muted/50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {isPaid ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleMonth(month)}
                                                    />
                                                )}
                                                <span className={isPaid ? 'text-muted-foreground line-through' : ''}>
                                                    {formatMonth(month)}
                                                </span>
                                                {isCurrent && !isPaid && (
                                                    <Badge variant="secondary" className="text-xs">Current</Badge>
                                                )}
                                            </div>
                                            {isPaid && (
                                                <Badge variant="secondary" className="bg-green-500/20 text-green-500 text-xs">
                                                    Paid
                                                </Badge>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Insufficient Balance Warning */}
                    {hasInsufficientBalance && selectedMonths.length > 0 && !skipPayment && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>
                                Insufficient balance. Need {credit.currency} {totalPayment.toLocaleString()}
                                but only have {credit.currency} {accountBalance.toLocaleString()}
                            </span>
                        </div>
                    )}

                    {/* Skip Payment Toggle */}
                    {selectedMonths.length > 0 && (
                        <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/50">
                            <Checkbox
                                id="skipPayment"
                                checked={skipPayment}
                                onCheckedChange={(checked) => setSkipPayment(!!checked)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="skipPayment" className="font-medium cursor-pointer">
                                    Mark as paid (skip payment)
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Mark months as paid without deducting money from account
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <SheetFooter className="border-t pt-4">
                    <div className="w-full space-y-3">
                        {/* Total */}
                        {selectedMonths.length > 0 && (
                            <div className="flex justify-between items-center text-lg font-semibold">
                                <span>Total ({selectedMonths.length} month{selectedMonths.length > 1 ? 's' : ''})</span>
                                <span>{credit.currency} {totalPayment.toLocaleString()}</span>
                            </div>
                        )}

                        <Button
                            className="w-full"
                            disabled={
                                selectedMonths.length === 0 ||
                                (hasInsufficientBalance && !skipPayment) ||
                                makePayment.isLoading ||
                                markAsPaid.isLoading
                            }
                            onClick={handleSubmit}
                        >
                            {makePayment.isLoading || markAsPaid.isLoading
                                ? 'Processing...'
                                : selectedMonths.length === 0
                                    ? 'Select months to pay'
                                    : skipPayment
                                        ? `Mark ${selectedMonths.length} month(s) as paid`
                                        : `Pay ${credit.currency} ${totalPayment.toLocaleString()}`
                            }
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
